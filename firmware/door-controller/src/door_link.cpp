#include "door_link.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

#include "access_list.h"
#include "secrets.h"

namespace {

// ============================================================================
// CONFIG
// ============================================================================

constexpr char FIRMWARE_VERSION[] = "1.1.0";

constexpr uint32_t HEARTBEAT_INTERVAL_MS = 2000;   // also how often commands are picked up
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 10000;
constexpr uint32_t EVENT_RETRY_INTERVAL_MS = 3000;
constexpr uint32_t REPORT_RETRY_INTERVAL_MS = 1000;
constexpr uint8_t REPORT_MAX_ATTEMPTS = 5;
constexpr uint16_t HTTP_TIMEOUT_MS = 4000;
constexpr uint32_t NET_LOOP_DELAY_MS = 50;

constexpr size_t EVENT_QUEUE_LENGTH = 32;
constexpr size_t COMMAND_QUEUE_LENGTH = 8;
constexpr size_t REPORT_QUEUE_LENGTH = 16;
constexpr size_t EVENTS_PER_POST = 10;

// Core 0 is where the WiFi stack already lives; the Arduino loop() runs on
// core 1, so door handling keeps its core to itself.
constexpr uint32_t NET_TASK_STACK_BYTES = 12288;  // TLS handshakes need the headroom
constexpr UBaseType_t NET_TASK_PRIORITY = 1;
constexpr BaseType_t NET_TASK_CORE = 0;

// ============================================================================
// Shared state (main loop <-> network task)
// ============================================================================

QueueHandle_t eventQueue = nullptr;
QueueHandle_t commandQueue = nullptr;
QueueHandle_t reportQueue = nullptr;

portMUX_TYPE statusMux = portMUX_INITIALIZER_UNLOCKED;
DoorStatus latestStatus = {};

// ============================================================================
// Network-task-only state
// ============================================================================

WiFiClient plainClient;
WiFiClientSecure secureClient;
bool useTls = false;

bool wifiConnected = false;
uint32_t lastWifiAttemptAt = 0;

bool backendReachable = false;
uint32_t lastHeartbeatAt = 0;
bool accessListStale = false;

DoorEvent pendingEvents[EVENTS_PER_POST];
size_t pendingEventCount = 0;
uint32_t lastEventAttemptAt = 0;

CommandReport pendingReport = {};
bool hasPendingReport = false;
uint8_t pendingReportAttempts = 0;
uint32_t lastReportAttemptAt = 0;

// ============================================================================
// Names — must match the backend's snake_case enum values
// ============================================================================

const char* eventTypeName(EventType type) {
  switch (type) {
    case EventType::Granted: return "granted";
    case EventType::Denied: return "denied";
    case EventType::ForcedOpen: return "forced_open";
    case EventType::LeftOpen: return "left_open";
    case EventType::DoorOpened: return "door_opened";
    case EventType::DoorClosed: return "door_closed";
  }
  return "denied";
}

const char* eventMethodName(EventMethod method) {
  switch (method) {
    case EventMethod::None: return "none";
    case EventMethod::Keypad: return "keypad";
    case EventMethod::Fingerprint: return "fingerprint";
    case EventMethod::ExitButton: return "exit_button";
  }
  return "none";
}

const char* commandStateName(CommandState state) {
  switch (state) {
    case CommandState::InProgress: return "in_progress";
    case CommandState::Succeeded: return "succeeded";
    case CommandState::Failed: return "failed";
  }
  return "failed";
}

bool parseCommandKind(const char* type, CommandKind& out) {
  if (strcmp(type, "unlock") == 0) {
    out = CommandKind::Unlock;
  } else if (strcmp(type, "enroll_fingerprint") == 0) {
    out = CommandKind::EnrollFingerprint;
  } else if (strcmp(type, "delete_fingerprint") == 0) {
    out = CommandKind::DeleteFingerprint;
  } else {
    return false;
  }
  return true;
}

void queueReport(const char* commandId, CommandState state, const char* message) {
  CommandReport report = {};
  strlcpy(report.id, commandId, sizeof(report.id));
  report.state = state;
  strlcpy(report.message, message, sizeof(report.message));
  linkReportCommand(report);
}

// ============================================================================
// HTTP
// ============================================================================

WiFiClient& transport() {
  return useTls ? static_cast<WiFiClient&>(secureClient) : plainClient;
}

// Returns the HTTP status code, or a negative HTTPClient error on a transport
// failure. Blocks this task only (up to HTTP_TIMEOUT_MS).
int sendRequest(const char* method, const String& path, const String& body, String* response) {
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(transport(), String(API_BASE_URL) + path)) {
    return HTTPC_ERROR_CONNECTION_REFUSED;
  }
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  http.addHeader("Accept", "application/json");

  int status;
  if (strcmp(method, "GET") == 0) {
    status = http.GET();
  } else {
    http.addHeader("Content-Type", "application/json");
    status = http.POST(body);
  }

  // getString() (not getStream()) because ASP.NET sends JSON chunked.
  if (response != nullptr && status > 0) {
    *response = http.getString();
  }
  http.end();
  return status;
}

void setBackendReachable(bool reachable, int status) {
  if (reachable == backendReachable) {
    return;
  }
  backendReachable = reachable;
  if (reachable) {
    Serial.println("[NET] backend reachable");
  } else {
    Serial.printf("[NET] backend unreachable (%d) — door keeps working on its saved access list\n", status);
  }
}

// ============================================================================
// WiFi
// ============================================================================

bool ensureWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiConnected) {
      wifiConnected = true;
      Serial.printf("[NET] WiFi connected, IP %s\n", WiFi.localIP().toString().c_str());
    }
    return true;
  }

  if (wifiConnected) {
    wifiConnected = false;
    setBackendReachable(false, HTTPC_ERROR_NOT_CONNECTED);
    Serial.println("[NET] WiFi lost, reconnecting");
  }
  if (now - lastWifiAttemptAt >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiAttemptAt = now;
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  return false;
}

// ============================================================================
// Heartbeat + commands
// ============================================================================

void sendHeartbeat() {
  DoorStatus status;
  portENTER_CRITICAL(&statusMux);
  status = latestStatus;
  portEXIT_CRITICAL(&statusMux);

  JsonDocument doc;
  doc["doorOpen"] = status.doorOpen;
  doc["locked"] = status.locked;
  doc["fingerprintReady"] = status.fingerprintReady;
  doc["templateCount"] = status.templateCount;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["ipAddress"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptimeMs"] = millis();

  String body;
  serializeJson(doc, body);
  String response;
  const int code = sendRequest("POST", "/device/heartbeat", body, &response);
  if (code != 200) {
    setBackendReachable(false, code);
    return;
  }
  setBackendReachable(true, code);

  JsonDocument reply;
  if (deserializeJson(reply, response) != DeserializationError::Ok) {
    Serial.println("[NET] heartbeat reply is not valid JSON");
    return;
  }

  char localVersion[ACCESS_VERSION_LENGTH + 1];
  accessListVersion(localVersion, sizeof(localVersion));
  const char* serverVersion = reply["accessListVersion"] | "";
  if (strcmp(serverVersion, localVersion) != 0) {
    accessListStale = true;
  }

  for (JsonObject item : reply["commands"].as<JsonArray>()) {
    DoorCommand command = {};
    strlcpy(command.id, item["id"] | "", sizeof(command.id));
    command.slot = item["slot"].isNull() ? -1 : item["slot"].as<int16_t>();
    const char* type = item["type"] | "";

    if (!parseCommandKind(type, command.kind)) {
      Serial.printf("[NET] unknown command type '%s', rejecting\n", type);
      queueReport(command.id, CommandState::Failed, "Unknown command");
      continue;
    }
    Serial.printf("[NET] command received: %s\n", type);
    if (xQueueSend(commandQueue, &command, 0) != pdTRUE) {
      queueReport(command.id, CommandState::Failed, "Door is busy, try again");
    }
  }
}

void syncAccessList() {
  String response;
  const int code = sendRequest("GET", "/device/access-list", "", &response);
  if (code != 200) {
    // Next heartbeat notices the version is still different and retries.
    Serial.printf("[ACCESS] sync failed (%d)\n", code);
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response) != DeserializationError::Ok) {
    Serial.println("[ACCESS] sync reply is not valid JSON");
    return;
  }

  // Static: ~3.7KB would be a big chunk of this task's stack.
  static AccessListData data;
  memset(&data, 0, sizeof(data));
  strlcpy(data.version, doc["version"] | "", sizeof(data.version));

  for (JsonObject pin : doc["pins"].as<JsonArray>()) {
    if (data.pinCount >= ACCESS_MAX_PINS) {
      Serial.printf("[ACCESS] more than %u PINs, the rest are ignored\n", static_cast<unsigned>(ACCESS_MAX_PINS));
      break;
    }
    const char* memberId = pin["memberId"] | "";
    const char* salt = pin["salt"] | "";
    AccessPin& entry = data.pins[data.pinCount];
    if (strlen(memberId) != MEMBER_ID_LENGTH || strlen(salt) == 0 || strlen(salt) > PIN_SALT_LENGTH ||
        !accessParseHash(pin["hash"] | "", entry.hash)) {
      Serial.println("[ACCESS] skipping malformed PIN entry");
      continue;
    }
    strlcpy(entry.memberId, memberId, sizeof(entry.memberId));
    strlcpy(entry.salt, salt, sizeof(entry.salt));
    data.pinCount++;
  }

  for (JsonVariant slot : doc["fingerprintSlots"].as<JsonArray>()) {
    if (data.fingerprintSlotCount >= ACCESS_MAX_FINGERPRINT_SLOTS) {
      break;
    }
    data.fingerprintSlots[data.fingerprintSlotCount++] = slot.as<uint16_t>();
  }

  accessListReplace(data);
}

// ============================================================================
// Events + command reports
// ============================================================================

void flushEvents(uint32_t now) {
  while (pendingEventCount < EVENTS_PER_POST &&
         xQueueReceive(eventQueue, &pendingEvents[pendingEventCount], 0) == pdTRUE) {
    pendingEventCount++;
  }
  if (pendingEventCount == 0 || now - lastEventAttemptAt < EVENT_RETRY_INTERVAL_MS) {
    return;
  }

  JsonDocument doc;
  JsonArray events = doc["events"].to<JsonArray>();
  const uint32_t sentAt = millis();
  for (size_t i = 0; i < pendingEventCount; i++) {
    const DoorEvent& event = pendingEvents[i];
    JsonObject item = events.add<JsonObject>();
    item["type"] = eventTypeName(event.type);
    item["method"] = eventMethodName(event.method);
    if (event.fingerprintSlot >= 0) {
      item["fingerprintSlot"] = event.fingerprintSlot;
    }
    if (event.memberId[0] != '\0') {
      item["memberId"] = event.memberId;
    }
    item["ageMs"] = sentAt - event.at;
  }

  String body;
  serializeJson(doc, body);
  const int code = sendRequest("POST", "/device/events", body, nullptr);
  if (code == 204 || code == 400) {
    // 400 = the backend will never accept this batch; retrying won't help.
    if (code == 400) {
      Serial.println("[NET] event batch rejected by backend, dropped");
    }
    pendingEventCount = 0;
    lastEventAttemptAt = 0;
  } else {
    lastEventAttemptAt = now;  // kept, retried after EVENT_RETRY_INTERVAL_MS
  }
}

void flushReports(uint32_t now) {
  if (!hasPendingReport) {
    if (xQueueReceive(reportQueue, &pendingReport, 0) != pdTRUE) {
      return;
    }
    hasPendingReport = true;
    pendingReportAttempts = 0;
    lastReportAttemptAt = 0;
  }
  if (lastReportAttemptAt != 0 && now - lastReportAttemptAt < REPORT_RETRY_INTERVAL_MS) {
    return;
  }

  JsonDocument doc;
  doc["status"] = commandStateName(pendingReport.state);
  if (pendingReport.step[0] != '\0') {
    doc["step"] = pendingReport.step;
  }
  if (pendingReport.message[0] != '\0') {
    doc["message"] = pendingReport.message;
  }
  String body;
  serializeJson(doc, body);

  const int code = sendRequest("POST", String("/device/commands/") + pendingReport.id, body, nullptr);
  pendingReportAttempts++;
  lastReportAttemptAt = now;

  // 404/400: the command is gone or the update is invalid — retrying won't
  // help. A lost progress step is fine (the next one supersedes it); a lost
  // final result is retried a few times.
  const bool done = code == 204 || code == 404 || code == 400;
  const bool giveUp = pendingReport.state == CommandState::InProgress || pendingReportAttempts >= REPORT_MAX_ATTEMPTS;
  if (done || giveUp) {
    if (!done) {
      Serial.printf("[NET] command report dropped after %u attempt(s) (%d)\n", pendingReportAttempts, code);
    }
    hasPendingReport = false;
  }
}

// ============================================================================
// Task
// ============================================================================

void netTask(void*) {
  for (;;) {
    const uint32_t now = millis();
    if (ensureWifi(now)) {
      flushReports(now);
      flushEvents(now);
      if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatAt = now;
        sendHeartbeat();
      }
      if (accessListStale) {
        accessListStale = false;
        syncAccessList();
      }
    }
    vTaskDelay(pdMS_TO_TICKS(NET_LOOP_DELAY_MS));
  }
}

}  // namespace

// ============================================================================
// Public API
// ============================================================================

void linkBegin() {
  eventQueue = xQueueCreate(EVENT_QUEUE_LENGTH, sizeof(DoorEvent));
  commandQueue = xQueueCreate(COMMAND_QUEUE_LENGTH, sizeof(DoorCommand));
  reportQueue = xQueueCreate(REPORT_QUEUE_LENGTH, sizeof(CommandReport));

  useTls = strncmp(API_BASE_URL, "https://", 8) == 0;
  if (useTls) {
#ifdef API_ROOT_CA
    secureClient.setCACert(API_ROOT_CA);
#else
    // No CA configured: traffic is encrypted but the server isn't verified.
    // Set API_ROOT_CA in secrets.h for production.
    secureClient.setInsecure();
    Serial.println("[NET] WARNING: HTTPS without API_ROOT_CA — server certificate not checked");
#endif
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptAt = millis();
  Serial.printf("[NET] connecting to WiFi '%s', backend %s\n", WIFI_SSID, API_BASE_URL);

  xTaskCreatePinnedToCore(netTask, "net", NET_TASK_STACK_BYTES, nullptr, NET_TASK_PRIORITY, nullptr, NET_TASK_CORE);
}

void linkPublishStatus(const DoorStatus& status) {
  portENTER_CRITICAL(&statusMux);
  latestStatus = status;
  portEXIT_CRITICAL(&statusMux);
}

void linkQueueEvent(const DoorEvent& event) {
  if (eventQueue == nullptr || xQueueSend(eventQueue, &event, 0) != pdTRUE) {
    Serial.println("[NET] event queue full, event dropped");
  }
}

void linkReportCommand(const CommandReport& report) {
  if (reportQueue == nullptr || xQueueSend(reportQueue, &report, 0) != pdTRUE) {
    Serial.println("[NET] report queue full, command report dropped");
  }
}

bool linkTakeCommand(DoorCommand& out) {
  return commandQueue != nullptr && xQueueReceive(commandQueue, &out, 0) == pdTRUE;
}
