#include "door_link.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

#include "access_list.h"
#include "secrets.h"

// Which door this controller is — its ID from the admin dashboard.
#ifndef DOOR_ID
#error "Set DOOR_ID in include/secrets.h (the door's ID from the admin dashboard)"
#endif

// Older secrets.h files used the device key as the MQTT password.
#ifndef MQTT_PASSWORD
#define MQTT_PASSWORD DEVICE_API_KEY
#endif

namespace {

// ============================================================================
// CONFIG
// ============================================================================

constexpr char FIRMWARE_VERSION[] = "2.1.0";

// Also how often app unlocks are picked up, so kept short. A door open/close
// or lock change sends one straight away as well (see statusChangedSinceHeartbeat).
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 500;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 10000;
constexpr uint32_t EVENT_RETRY_INTERVAL_MS = 3000;
constexpr uint32_t REPORT_RETRY_INTERVAL_MS = 1000;
constexpr uint8_t REPORT_MAX_ATTEMPTS = 5;
constexpr uint16_t HTTP_TIMEOUT_MS = 4000;
constexpr uint32_t NET_LOOP_DELAY_MS = 20;

// MQTT (must match backend/Mqtt/DoorMqttTopics.cs and mosquitto/acl).
// Every door controller logs in as "door" (shared MQTT_PASSWORD) and only
// uses its own topics: smartdoor/door/<DOOR_ID>/<kind>.
constexpr char MQTT_USERNAME[] = "door";
constexpr char MQTT_TOPIC_CMD[] = "smartdoor/door/" DOOR_ID "/cmd";
constexpr char MQTT_TOPIC_ACCESS[] = "smartdoor/door/" DOOR_ID "/access";
constexpr char MQTT_TOPIC_STATUS[] = "smartdoor/door/" DOOR_ID "/status";
constexpr char MQTT_TOPIC_REPORT[] = "smartdoor/door/" DOOR_ID "/report";
constexpr char MQTT_TOPIC_ONLINE[] = "smartdoor/door/" DOOR_ID "/online";
constexpr uint32_t MQTT_RETRY_INTERVAL_MS = 10000;
// Status goes out on every change; this keeps "last seen" fresh when nothing
// changes (the backend calls the door offline after 10s of silence).
constexpr uint32_t MQTT_STATUS_INTERVAL_MS = 4000;
constexpr uint16_t MQTT_KEEPALIVE_S = 10;
constexpr uint16_t MQTT_BUFFER_BYTES = 1024;

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
// Door state in the last heartbeat sent, to spot changes worth sending now.
bool sentDoorOpen = false;
bool sentLocked = true;
bool accessListStale = false;

DoorEvent pendingEvents[EVENTS_PER_POST];
size_t pendingEventCount = 0;
uint32_t lastEventAttemptAt = 0;

WiFiClientSecure mqttTls;
PubSubClient mqtt(mqttTls);
uint32_t lastMqttAttemptAt = 0;
uint32_t lastMqttStatusAt = 0;

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
  // One HTTPClient for the whole run (net task only). A local one would close
  // the TLS connection when it goes out of scope — its destructor stops the
  // client — so every request paid a ~1s handshake. Kept alive, the
  // connection is opened once and reused.
  static HTTPClient http;
  http.setReuse(true);
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
  if (status < 0) {
    // Broken connection — drop it so the next request starts a fresh one.
    transport().stop();
  }
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

bool statusChangedSinceHeartbeat() {
  portENTER_CRITICAL(&statusMux);
  const bool changed = latestStatus.doorOpen != sentDoorOpen || latestStatus.locked != sentLocked;
  portEXIT_CRITICAL(&statusMux);
  return changed;
}

// Current door state as JSON — the REST heartbeat body and the MQTT status
// message are the same. Also remembers what was sent, to spot changes.
String buildStatusBody() {
  DoorStatus status;
  portENTER_CRITICAL(&statusMux);
  status = latestStatus;
  portEXIT_CRITICAL(&statusMux);
  sentDoorOpen = status.doorOpen;
  sentLocked = status.locked;

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
  return body;
}

// The access list changed on the server when its version differs from ours.
void checkAccessVersion(const char* serverVersion) {
  char localVersion[ACCESS_VERSION_LENGTH + 1];
  accessListVersion(localVersion, sizeof(localVersion));
  if (serverVersion[0] != '\0' && strcmp(serverVersion, localVersion) != 0) {
    accessListStale = true;
  }
}

// One command ({ id, type, slot }) from the server, over MQTT or REST.
void handleCommand(JsonObjectConst item) {
  DoorCommand command = {};
  strlcpy(command.id, item["id"] | "", sizeof(command.id));
  command.slot = item["slot"].isNull() ? -1 : item["slot"].as<int16_t>();
  const char* type = item["type"] | "";

  if (!parseCommandKind(type, command.kind)) {
    Serial.printf("[NET] unknown command type '%s', rejecting\n", type);
    queueReport(command.id, CommandState::Failed, "Unknown command");
    return;
  }
  Serial.printf("[NET] command received: %s\n", type);
  if (xQueueSend(commandQueue, &command, 0) != pdTRUE) {
    queueReport(command.id, CommandState::Failed, "Door is busy, try again");
  }
}

// REST fallback while MQTT is down: status up, commands + access version back.
void sendHeartbeat() {
  const String body = buildStatusBody();
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

  checkAccessVersion(reply["accessListVersion"] | "");
  for (JsonObjectConst item : reply["commands"].as<JsonArrayConst>()) {
    handleCommand(item);
  }
}

// ============================================================================
// MQTT — the always-on link. The server pushes commands the moment they're
// made; the door pushes its state the moment it changes. REST (above) is only
// the fallback while the broker can't be reached.
// ============================================================================

void publishMqttStatus(uint32_t now) {
  lastMqttStatusAt = now;
  const String body = buildStatusBody();
  if (mqtt.publish(MQTT_TOPIC_STATUS, body.c_str())) {
    setBackendReachable(true, 0);
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, MQTT_TOPIC_CMD) == 0) {
    JsonDocument doc;
    if (deserializeJson(doc, payload, length) != DeserializationError::Ok) {
      Serial.println("[MQTT] command is not valid JSON");
      return;
    }
    handleCommand(doc.as<JsonObjectConst>());
  } else if (strcmp(topic, MQTT_TOPIC_ACCESS) == 0) {
    char version[ACCESS_VERSION_LENGTH + 1];
    const size_t copy = length < ACCESS_VERSION_LENGTH ? length : ACCESS_VERSION_LENGTH;
    memcpy(version, payload, copy);
    version[copy] = '\0';
    checkAccessVersion(version);
  }
}

bool ensureMqtt(uint32_t now) {
  if (mqtt.connected()) {
    return true;
  }
  if (lastMqttAttemptAt != 0 && now - lastMqttAttemptAt < MQTT_RETRY_INTERVAL_MS) {
    return false;
  }
  lastMqttAttemptAt = now;

  char clientId[32];
  snprintf(clientId, sizeof(clientId), "smartdoor-door-%06llx", ESP.getEfuseMac() & 0xFFFFFFULL);
  // Last will: the broker announces "0" the moment this connection drops,
  // so the app shows the door offline straight away.
  if (!mqtt.connect(clientId, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TOPIC_ONLINE, 1, true, "0", true)) {
    Serial.printf("[MQTT] connect failed (state %d) — using REST meanwhile\n", mqtt.state());
    return false;
  }

  mqtt.subscribe(MQTT_TOPIC_CMD, 1);
  mqtt.subscribe(MQTT_TOPIC_ACCESS, 1);
  publishMqttStatus(now);
  mqtt.publish(MQTT_TOPIC_ONLINE, "1", true);
  Serial.println("[MQTT] connected — commands are pushed from now on");
  return true;
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
  int code;
  if (mqtt.connected()) {
    // Over MQTT the id travels in the message; "published" counts as done.
    doc["id"] = pendingReport.id;
    String body;
    serializeJson(doc, body);
    code = mqtt.publish(MQTT_TOPIC_REPORT, body.c_str()) ? 204 : -1;
  } else {
    String body;
    serializeJson(doc, body);
    code = sendRequest("POST", String("/device/commands/") + pendingReport.id, body, nullptr);
  }
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
      const bool onMqtt = ensureMqtt(now);
      if (onMqtt) {
        mqtt.loop();  // receives pushed commands / access version
        if (statusChangedSinceHeartbeat() || now - lastMqttStatusAt >= MQTT_STATUS_INTERVAL_MS) {
          publishMqttStatus(now);
        }
      }
      flushReports(now);
      flushEvents(now);
      if (!onMqtt && (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS || statusChangedSinceHeartbeat())) {
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

  // Broker uses a self-signed cert: encrypted, not verified (same trade-off
  // as HTTPS without API_ROOT_CA). The door's login + the broker ACL guard it.
  mqttTls.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
  mqtt.setSocketTimeout(5);
  mqtt.setBufferSize(MQTT_BUFFER_BYTES);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptAt = millis();
  Serial.printf("[NET] connecting to WiFi '%s', backend %s, MQTT %s:%d\n", WIFI_SSID, API_BASE_URL, MQTT_HOST, MQTT_PORT);

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
