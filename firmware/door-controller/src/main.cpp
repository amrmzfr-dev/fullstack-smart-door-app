// Smart door controller — ESP32 (esp32dev)
//
// One access-controlled door:
//   - 4x3 matrix keypad (PIN entry)
//   - AS608 optical fingerprint sensor
//   - relay-driven EM lock
//   - door exit button (free egress)
//   - magnetic door contact (reed switch)
//   - DFPlayer Mini MP3 module (audio feedback)
//   - WiFi link to the Smart Door backend (REST only, see door_link.cpp):
//     access events, remote unlock, PIN/fingerprint access list sync and
//     fingerprint enrollment from the web app
//
// The main loop is fully non-blocking: every timer (relay pulse, debounce,
// keypad entry timeout, door-left-open timeout, fingerprint poll interval)
// is millis()-based and there is no delay() in loop(). All HTTP work runs on
// a separate FreeRTOS task, so a slow or dead server never stalls the door.

#include <Arduino.h>
#include <Adafruit_Fingerprint.h>
#include <DFRobotDFPlayerMini.h>
#include <Keypad.h>

#include "access_list.h"
#include "door_link.h"

// ============================================================================
// CONFIG — tune values here, no need to touch the logic below
// ============================================================================

// ---- Keypad diagnostic mode (TEMPORARY) ------------------------------------
// 1 = bypass the Keypad library and print raw wire contacts for every press,
//     so the real row/col layout of the unlabeled keypad can be mapped.
//     PIN entry is disabled while this is on.
// 0 = normal operation.
#define KEYPAD_DIAGNOSTIC 0

// ---- Keypad (4x3 matrix) ---------------------------------------------------
// Same 7 wires on the same 7 GPIOs as the original mapout (13, 14, 27, 26,
// 25, 33, 32). The unlabeled module's pads don't follow the usual pinout, so
// the real row/col roles were measured with KEYPAD_DIAGNOSTIC (2026-09-23):
// GPIO13 and GPIO27 turned out to be columns, GPIO33 and GPIO32 rows.
constexpr uint8_t PIN_KEYPAD_ROW1 = 14;  // Keypad Row 1 — keys 1 2 3 (output)
constexpr uint8_t PIN_KEYPAD_ROW2 = 33;  // Keypad Row 2 — keys 4 5 6 (output)
constexpr uint8_t PIN_KEYPAD_ROW3 = 32;  // Keypad Row 3 — keys 7 8 9 (output)
constexpr uint8_t PIN_KEYPAD_ROW4 = 26;  // Keypad Row 4 — keys * 0 # (output)
constexpr uint8_t PIN_KEYPAD_COL1 = 27;  // Keypad Col 1 — keys 1 4 7 * (input, pull-up)
constexpr uint8_t PIN_KEYPAD_COL2 = 13;  // Keypad Col 2 — keys 2 5 8 0 (input, pull-up)
constexpr uint8_t PIN_KEYPAD_COL3 = 25;  // Keypad Col 3 — keys 3 6 9 # (input, pull-up)

// ---- Relay module (drives EM lock) -----------------------------------------
constexpr uint8_t PIN_RELAY = 18;  // Relay module signal (output) -> EM lock
// true  = relay energises when the signal pin is LOW (most cheap modules)
// false = relay energises when the signal pin is HIGH
constexpr bool RELAY_ACTIVE_LOW = true;

// ---- Door exit button (dry contact, momentary, wired to GND) ---------------
constexpr uint8_t PIN_EXIT_BUTTON = 19;  // Exit button input (pull-up), pressed = LOW

// ---- Magnetic door contact (reed switch, dry contact, wired to GND) --------
constexpr uint8_t PIN_DOOR_SENSOR = 23;  // Door contact input (pull-up)
// Reed closed (magnet next to it) pulls the pin to GND -> door CLOSED.
// Flip to HIGH if your contact is normally-closed and opens with the magnet.
constexpr int DOOR_CLOSED_LEVEL = LOW;

// ---- DFPlayer Mini MP3 module (UART1, remapped pins) -----------------------
// Wiring note: put a 1k ohm resistor in series on the ESP32 TX (GPIO4) ->
// DFPlayer RX line. It cuts the audible hiss/noise caused by the 3.3V/5V
// level mismatch. Not code-relevant.
constexpr uint8_t PIN_MP3_TX = 4;  // ESP32 TX -> DFPlayer RX (via 1k series resistor)
constexpr uint8_t PIN_MP3_RX = 5;  // ESP32 RX <- DFPlayer TX
constexpr uint32_t MP3_BAUD = 9600;
constexpr uint8_t MP3_VOLUME = 25;  // 0..30
// SD card layout: folder "01" holding 001.mp3 .. 004.mp3 (see SoundId below).
constexpr uint8_t MP3_FOLDER = 1;

// ---- AS608 fingerprint sensor (UART2, hardware serial) ---------------------
constexpr uint8_t PIN_FP_RX = 16;  // ESP32 RX2 <- AS608 TX
constexpr uint8_t PIN_FP_TX = 17;  // ESP32 TX2 -> AS608 RX
constexpr uint32_t FP_BAUD = 57600;
// Template IDs the backend may assign (FingerprintSlots on the backend).
constexpr int16_t FINGERPRINT_MIN_SLOT = 1;
constexpr int16_t FINGERPRINT_MAX_SLOT = 127;

// ---- PIN code --------------------------------------------------------------
// Real PINs are set per person in the web app and synced to NVS (see
// access_list.cpp). DEFAULT_PIN is only used until the door has synced with
// the backend once — after that it stops working, even while offline.
constexpr char DEFAULT_PIN[] = "1459";
// Must match PinRules on the backend.
constexpr uint8_t PIN_MIN_LENGTH = 4;
constexpr uint8_t PIN_MAX_LENGTH = 4;  // PINs are exactly 4 digits
// false = log keypad digits as "<digit>" instead of the real value, so PINs
// don't show up in the serial log. Turn off once the door is in real use.
constexpr bool LOG_PIN_DIGITS = true;

// ---- Timing (all milliseconds) ---------------------------------------------
constexpr uint32_t UNLOCK_DURATION_MS = 5000;          // relay pulse length
constexpr uint32_t DEBOUNCE_MS = 50;                   // exit button + door sensor
constexpr uint32_t KEYPAD_DEBOUNCE_MS = 20;            // Keypad library internal debounce
constexpr uint32_t KEYPAD_ENTRY_TIMEOUT_MS = 10000;    // half-typed PIN is dropped after this idle time
constexpr uint32_t FINGERPRINT_POLL_INTERVAL_MS = 150; // how often to ask the AS608 for a finger
// A door opening this soon after the lock re-engaged is still treated as an
// authorised entry (someone pulling the door right as the lock closes).
constexpr uint32_t DOOR_OPEN_GRACE_MS = 2000;
constexpr uint32_t DOOR_LEFT_OPEN_TIMEOUT_MS = 30000;  // alarm if still open this long after opening
constexpr uint32_t ENROLL_STEP_TIMEOUT_MS = 20000;     // enrollment gives up if a finger step takes longer
constexpr uint32_t STATUS_PUBLISH_INTERVAL_MS = 250;   // how often the heartbeat snapshot is refreshed

static_assert(sizeof(DEFAULT_PIN) - 1 >= PIN_MIN_LENGTH && sizeof(DEFAULT_PIN) - 1 <= PIN_MAX_LENGTH,
              "DEFAULT_PIN must be PIN_MIN_LENGTH..PIN_MAX_LENGTH digits");

// ---- Sound tracks (placeholders — remap to your SD card files) -------------
enum SoundId : uint8_t {
  SOUND_UNLOCK_OK = 1,    // 01/001.mp3 — successful unlock
  SOUND_REJECTED = 2,     // 01/002.mp3 — wrong PIN / unknown fingerprint
  SOUND_FORCED_OPEN = 3,  // 01/003.mp3 — door forced open alarm
  SOUND_LEFT_OPEN = 4,    // 01/004.mp3 — door left open warning
};

// ============================================================================
// Types and state
// ============================================================================

enum class UnlockSource { Keypad, Fingerprint, ExitButton, Remote };
enum class AlarmType { ForcedOpen, LeftOpen };
enum class FingerprintState { WaitForFinger, WaitForRemoval };
enum class EnrollStep { WaitFirstFinger, WaitRemoval, WaitSecondFinger };

struct DebouncedInput {
  uint8_t pin;
  int stableLevel;
  int lastRawLevel;
  uint32_t lastRawChangeAt;
};

// ---- Keypad ----
// The Keypad library drives its "column" pins as outputs and reads its "row"
// pins with pull-ups. Our wiring is the other way round (physical rows are
// outputs, physical columns are pulled-up inputs), so the library gets the
// matrix transposed: library rows = our columns, library columns = our rows.
constexpr uint8_t KEYPAD_ROW_COUNT = 4;
constexpr uint8_t KEYPAD_COL_COUNT = 3;
byte keypadRowPins[KEYPAD_ROW_COUNT] = {PIN_KEYPAD_ROW1, PIN_KEYPAD_ROW2, PIN_KEYPAD_ROW3, PIN_KEYPAD_ROW4};
byte keypadColPins[KEYPAD_COL_COUNT] = {PIN_KEYPAD_COL1, PIN_KEYPAD_COL2, PIN_KEYPAD_COL3};
// Physical layout:   1 2 3 / 4 5 6 / 7 8 9 / * 0 #   (stored column by column)
char keymapTransposed[KEYPAD_COL_COUNT][KEYPAD_ROW_COUNT] = {
    {'1', '4', '7', '*'},
    {'2', '5', '8', '0'},
    {'3', '6', '9', '#'},
};
Keypad keypad(makeKeymap(keymapTransposed), keypadColPins, keypadRowPins, KEYPAD_COL_COUNT, KEYPAD_ROW_COUNT);

char pinBuffer[PIN_MAX_LENGTH + 1] = {0};
uint8_t pinLength = 0;
uint32_t lastKeyAt = 0;

// ---- Fingerprint ----
Adafruit_Fingerprint finger(&Serial2);
bool fingerprintReady = false;
uint16_t fingerprintTemplateCount = 0;
FingerprintState fingerprintState = FingerprintState::WaitForFinger;
uint32_t lastFingerprintPollAt = 0;

// ---- Fingerprint enrollment (started from the web app) ----
// While active, the sensor is used only for enrolling — normal fingerprint
// unlock is paused so the new finger can't open the door mid-enrollment.
struct Enrollment {
  bool active;
  char commandId[COMMAND_ID_LENGTH + 1];
  uint16_t slot;
  EnrollStep step;
  uint32_t stepStartedAt;
};
Enrollment enrollment = {};

// ---- Backend link ----
uint32_t lastStatusPublishAt = 0;

// ---- MP3 ----
DFRobotDFPlayerMini mp3;
bool mp3Ready = false;

// ---- Relay ----
bool relayUnlocked = false;
uint32_t unlockStartedAt = 0;        // first trigger of the current unlock
uint32_t unlockLastTriggeredAt = 0;  // latest trigger (re-triggers extend the pulse)
bool hasRelocked = false;
uint32_t lastRelockAt = 0;
bool waitingForDoorClose = false;  // pulse ended but door still open

// ---- Inputs ----
DebouncedInput exitButton = {PIN_EXIT_BUTTON, HIGH, HIGH, 0};
DebouncedInput doorSensor = {PIN_DOOR_SENSOR, HIGH, HIGH, 0};

// ---- Door ----
bool doorOpen = false;
uint32_t doorOpenedAt = 0;
bool leftOpenAlarmRaised = false;

// ============================================================================
// Helpers
// ============================================================================

const char* unlockSourceName(UnlockSource source) {
  switch (source) {
    case UnlockSource::Keypad: return "KEYPAD";
    case UnlockSource::Fingerprint: return "FINGERPRINT";
    case UnlockSource::ExitButton: return "EXIT_BUTTON";
    case UnlockSource::Remote: return "REMOTE";
  }
  return "UNKNOWN";
}

const char* soundName(SoundId soundId) {
  switch (soundId) {
    case SOUND_UNLOCK_OK: return "unlock OK";
    case SOUND_REJECTED: return "rejected";
    case SOUND_FORCED_OPEN: return "door forced open alarm";
    case SOUND_LEFT_OPEN: return "door left open warning";
  }
  return "unknown";
}

void debounceInit(DebouncedInput& input, uint32_t now) {
  pinMode(input.pin, INPUT_PULLUP);
  const int level = digitalRead(input.pin);
  input.stableLevel = level;
  input.lastRawLevel = level;
  input.lastRawChangeAt = now;
}

// Returns true exactly once when the input settles on a new level.
bool debounceUpdate(DebouncedInput& input, uint32_t now) {
  const int raw = digitalRead(input.pin);
  if (raw != input.lastRawLevel) {
    input.lastRawLevel = raw;
    input.lastRawChangeAt = now;
    return false;
  }
  if (raw != input.stableLevel && now - input.lastRawChangeAt >= DEBOUNCE_MS) {
    input.stableLevel = raw;
    return true;
  }
  return false;
}

void setRelayUnlocked(bool unlocked) {
  const bool drivePinLow = RELAY_ACTIVE_LOW ? unlocked : !unlocked;
  digitalWrite(PIN_RELAY, drivePinLow ? LOW : HIGH);
}

// Fallback only — used until the first access list sync (see DEFAULT_PIN).
// Compares every digit even after a mismatch so timing doesn't leak how many
// leading digits were right.
bool defaultPinMatches(const char* entered, uint8_t enteredLength) {
  const char* stored = DEFAULT_PIN;
  const size_t storedLength = strlen(stored);
  uint8_t diff = (enteredLength == storedLength) ? 0 : 1;
  for (size_t i = 0; i < storedLength; i++) {
    const char enteredDigit = (i < enteredLength) ? entered[i] : 0;
    diff |= static_cast<uint8_t>(enteredDigit ^ stored[i]);
  }
  return diff == 0;
}

void clearPinBuffer() {
  memset(pinBuffer, 0, sizeof(pinBuffer));
  pinLength = 0;
}

// ============================================================================
// Backend link helpers
// ============================================================================

void emitEvent(EventType type, EventMethod method, int16_t fingerprintSlot = -1, const char* memberId = nullptr) {
  DoorEvent event = {};
  event.type = type;
  event.method = method;
  event.fingerprintSlot = fingerprintSlot;
  if (memberId != nullptr) {
    strlcpy(event.memberId, memberId, sizeof(event.memberId));
  }
  event.at = millis();
  linkQueueEvent(event);
}

void reportCommand(const char* commandId, CommandState state, const char* step = "", const char* message = "") {
  CommandReport report = {};
  strlcpy(report.id, commandId, sizeof(report.id));
  report.state = state;
  strlcpy(report.step, step, sizeof(report.step));
  strlcpy(report.message, message, sizeof(report.message));
  linkReportCommand(report);
}

// ============================================================================
// Feedback + alarm
// ============================================================================

void playFeedback(SoundId soundId) {
  Serial.printf("[MP3] playing track %03u: %s\n", soundId, soundName(soundId));
  if (!mp3Ready) {
    Serial.println("[MP3] module not ready, sound skipped");
    return;
  }
  // ACK mode is off (see initMp3), so this doesn't wait for a reply.
  mp3.playFolder(MP3_FOLDER, soundId);
}

// ---------------------------------------------------------------------------
// TODO(alarm): hook for real alarm output — siren/buzzer GPIO, etc. Called
// once per alarm event. (Reporting to the backend is already done in
// raiseAlarm.)
// ---------------------------------------------------------------------------
void onAlarm(AlarmType type) {
  (void)type;
}

void raiseAlarm(AlarmType type) {
  if (type == AlarmType::ForcedOpen) {
    Serial.println("[DOOR_SENSOR] ALARM: forced open");
    playFeedback(SOUND_FORCED_OPEN);
    emitEvent(EventType::ForcedOpen, EventMethod::None);
  } else {
    Serial.println("[DOOR_SENSOR] ALARM: left open timeout");
    playFeedback(SOUND_LEFT_OPEN);
    emitEvent(EventType::LeftOpen, EventMethod::None);
  }
  onAlarm(type);
}

// ============================================================================
// Unlock / relay
// ============================================================================

void triggerUnlock(UnlockSource source, uint32_t now) {
  Serial.printf("[RELAY] unlock triggered, source: %s\n", unlockSourceName(source));
  if (!relayUnlocked) {
    relayUnlocked = true;
    unlockStartedAt = now;
    setRelayUnlocked(true);
  }
  // A new trigger while already unlocked restarts the pulse window.
  unlockLastTriggeredAt = now;
  waitingForDoorClose = false;
  playFeedback(SOUND_UNLOCK_OK);
}

void handleRelay(uint32_t now) {
  if (!relayUnlocked || now - unlockLastTriggeredAt < UNLOCK_DURATION_MS) {
    return;
  }
  // Pulse is over but the door is still open: keep the lock released until
  // it closes, so the EM lock engages on a shut door. The left-open alarm in
  // handleDoorSensor() still fires if it stays open too long.
  if (doorOpen) {
    if (!waitingForDoorClose) {
      waitingForDoorClose = true;
      Serial.println("[RELAY] door still open, waiting for close to re-lock");
    }
    return;
  }
  waitingForDoorClose = false;
  setRelayUnlocked(false);
  relayUnlocked = false;
  hasRelocked = true;
  lastRelockAt = now;
  Serial.printf("[RELAY] re-locked after %lums\n", static_cast<unsigned long>(now - unlockStartedAt));
}

bool isEntryAuthorized(uint32_t now) {
  return relayUnlocked || (hasRelocked && now - lastRelockAt <= DOOR_OPEN_GRACE_MS);
}

// ============================================================================
// Keypad
// ============================================================================

void submitPin(uint32_t now) {
  char memberId[MEMBER_ID_LENGTH + 1] = "";
  bool accepted = false;
  if (pinLength >= PIN_MIN_LENGTH && pinLength <= PIN_MAX_LENGTH) {
    accepted = accessListLoaded() ? accessCheckPin(pinBuffer, memberId, sizeof(memberId))
                                  : defaultPinMatches(pinBuffer, pinLength);
  }
  clearPinBuffer();
  Serial.printf("[KEYPAD] PIN result: %s\n", accepted ? "ACCEPTED" : "REJECTED");
  if (accepted) {
    triggerUnlock(UnlockSource::Keypad, now);
    emitEvent(EventType::Granted, EventMethod::Keypad, -1, memberId);
  } else {
    playFeedback(SOUND_REJECTED);
    emitEvent(EventType::Denied, EventMethod::Keypad);
  }
}

void handleKeypad(uint32_t now) {
  if (pinLength > 0 && now - lastKeyAt >= KEYPAD_ENTRY_TIMEOUT_MS) {
    clearPinBuffer();
    Serial.println("[KEYPAD] entry timed out, cleared");
  }

  const char key = keypad.getKey();
  if (key == NO_KEY) {
    return;
  }
  lastKeyAt = now;

  const bool isDigit = key >= '0' && key <= '9';
  if (isDigit && !LOG_PIN_DIGITS) {
    Serial.println("[KEYPAD] key pressed: <digit>");
  } else {
    Serial.printf("[KEYPAD] key pressed: %c\n", key);
  }

  if (key == '*') {
    clearPinBuffer();
    Serial.println("[KEYPAD] entry cleared");
    return;
  }
  if (key == '#') {
    submitPin(now);
    return;
  }
  if (pinLength < PIN_MAX_LENGTH) {
    pinBuffer[pinLength++] = key;
  } else {
    Serial.println("[KEYPAD] max PIN length reached, key ignored");
  }
}

#if KEYPAD_DIAGNOSTIC
// ============================================================================
// Keypad diagnostic (TEMPORARY — see KEYPAD_DIAGNOSTIC in the config section)
// ============================================================================

// All 7 keypad wires. Every pair is tested (not just row x col), so a key that
// connects two "row" wires or two "col" wires still shows up instead of
// looking dead.
struct KeypadWire {
  uint8_t gpio;
  bool isRow;
  uint8_t number;  // 1-based, as in the config section (Row 1..4, Col 1..3)
};
constexpr KeypadWire KEYPAD_WIRES[] = {
    {PIN_KEYPAD_ROW1, true, 1},  {PIN_KEYPAD_ROW2, true, 2},  {PIN_KEYPAD_ROW3, true, 3},
    {PIN_KEYPAD_ROW4, true, 4},  {PIN_KEYPAD_COL1, false, 1}, {PIN_KEYPAD_COL2, false, 2},
    {PIN_KEYPAD_COL3, false, 3},
};
constexpr uint8_t KEYPAD_WIRE_COUNT = sizeof(KEYPAD_WIRES) / sizeof(KEYPAD_WIRES[0]);
constexpr int8_t NO_CONTACT = -1;
constexpr uint32_t KEYPAD_DIAG_DEBOUNCE_MS = 30;

int8_t diagStableA = NO_CONTACT;  // indexes into KEYPAD_WIRES
int8_t diagStableB = NO_CONTACT;
int8_t diagRawA = NO_CONTACT;
int8_t diagRawB = NO_CONTACT;
uint32_t diagRawChangedAt = 0;

void keypadDiagInit() {
  for (const KeypadWire& wire : KEYPAD_WIRES) {
    pinMode(wire.gpio, INPUT_PULLUP);
  }
  Serial.println("[KEYPAD_DIAG] diagnostic mode ON — PIN entry disabled");
  Serial.println("[KEYPAD_DIAG] press keys one at a time: 1 2 3 4 5 6 7 8 9 * 0 #");
}

// Drives each wire LOW in turn and checks which later wire gets pulled down
// with it. Only wires not yet driven are read, so a line still recovering
// from being driven is never misread.
void keypadDiagFindContact(int8_t& wireA, int8_t& wireB) {
  wireA = NO_CONTACT;
  wireB = NO_CONTACT;
  for (uint8_t i = 0; i < KEYPAD_WIRE_COUNT; i++) {
    pinMode(KEYPAD_WIRES[i].gpio, OUTPUT);
    digitalWrite(KEYPAD_WIRES[i].gpio, LOW);
    delayMicroseconds(10);  // line settle time — microseconds, not a loop stall
    for (uint8_t j = i + 1; j < KEYPAD_WIRE_COUNT; j++) {
      if (digitalRead(KEYPAD_WIRES[j].gpio) == LOW) {
        wireA = i;
        wireB = j;
        break;
      }
    }
    pinMode(KEYPAD_WIRES[i].gpio, INPUT_PULLUP);
    if (wireA != NO_CONTACT) {
      return;
    }
  }
}

void keypadDiagPrint(int8_t wireA, int8_t wireB) {
  const KeypadWire& a = KEYPAD_WIRES[wireA];
  const KeypadWire& b = KEYPAD_WIRES[wireB];
  if (a.isRow != b.isRow) {
    const KeypadWire& row = a.isRow ? a : b;
    const KeypadWire& col = a.isRow ? b : a;
    Serial.printf("[KEYPAD_DIAG] RAW -> Row %u (GPIO%u), Col %u (GPIO%u)\n",
                  row.number, row.gpio, col.number, col.gpio);
  } else {
    Serial.printf("[KEYPAD_DIAG] RAW -> %s %u (GPIO%u) <-> %s %u (GPIO%u)  [same-type pair]\n",
                  a.isRow ? "Row" : "Col", a.number, a.gpio,
                  b.isRow ? "Row" : "Col", b.number, b.gpio);
  }
}

// Prints once per press (debounced), nothing on release or while held.
void handleKeypadDiagnostic(uint32_t now) {
  int8_t wireA;
  int8_t wireB;
  keypadDiagFindContact(wireA, wireB);

  if (wireA != diagRawA || wireB != diagRawB) {
    diagRawA = wireA;
    diagRawB = wireB;
    diagRawChangedAt = now;
    return;
  }
  if ((wireA != diagStableA || wireB != diagStableB) && now - diagRawChangedAt >= KEYPAD_DIAG_DEBOUNCE_MS) {
    diagStableA = wireA;
    diagStableB = wireB;
    if (wireA != NO_CONTACT) {
      keypadDiagPrint(wireA, wireB);
    }
  }
}
#endif  // KEYPAD_DIAGNOSTIC

// ============================================================================
// Fingerprint
// ============================================================================

// Polled on an interval as a small state machine. Each Adafruit_Fingerprint
// call is a short synchronous UART exchange with the sensor; nothing here
// waits for a finger to arrive or leave — that is spread across loop passes.
void handleFingerprint(uint32_t now) {
  if (!fingerprintReady || enrollment.active || now - lastFingerprintPollAt < FINGERPRINT_POLL_INTERVAL_MS) {
    return;
  }
  lastFingerprintPollAt = now;

  const uint8_t imageResult = finger.getImage();

  // After a scan, wait for the finger to lift before accepting the next one,
  // so one long touch doesn't produce repeated matches.
  if (fingerprintState == FingerprintState::WaitForRemoval) {
    if (imageResult == FINGERPRINT_NOFINGER) {
      fingerprintState = FingerprintState::WaitForFinger;
    }
    return;
  }

  if (imageResult != FINGERPRINT_OK) {
    return;  // no finger, or a bad capture — try again next poll
  }

  Serial.println("[FINGERPRINT] scan started");
  fingerprintState = FingerprintState::WaitForRemoval;

  if (finger.image2Tz() != FINGERPRINT_OK) {
    Serial.println("[FINGERPRINT] no match (image unreadable)");
    playFeedback(SOUND_REJECTED);
    emitEvent(EventType::Denied, EventMethod::Fingerprint);
    return;
  }

  const uint8_t searchResult = finger.fingerFastSearch();
  if (searchResult == FINGERPRINT_OK) {
    const uint16_t slot = finger.fingerID;
    Serial.printf("[FINGERPRINT] match found: ID %u, confidence %u\n", slot, finger.confidence);
    // A template still on the sensor but no longer on the access list
    // (member disabled / removed, delete not yet run) must not open the door.
    if (accessListLoaded() && !accessFingerprintAllowed(slot)) {
      Serial.printf("[FINGERPRINT] ID %u is not on the access list, rejected\n", slot);
      playFeedback(SOUND_REJECTED);
      emitEvent(EventType::Denied, EventMethod::Fingerprint, static_cast<int16_t>(slot));
      return;
    }
    triggerUnlock(UnlockSource::Fingerprint, millis());
    emitEvent(EventType::Granted, EventMethod::Fingerprint, static_cast<int16_t>(slot));
  } else if (searchResult == FINGERPRINT_NOTFOUND) {
    Serial.println("[FINGERPRINT] no match");
    playFeedback(SOUND_REJECTED);
    emitEvent(EventType::Denied, EventMethod::Fingerprint);
  } else {
    Serial.printf("[FINGERPRINT] sensor error during search (code 0x%02X)\n", searchResult);
  }
}

// ============================================================================
// Fingerprint enrollment + delete (commands from the web app)
// ============================================================================

void refreshTemplateCount() {
  if (finger.getTemplateCount() == FINGERPRINT_OK) {
    fingerprintTemplateCount = finger.templateCount;
  }
}

bool isValidSlot(int16_t slot) {
  return slot >= FINGERPRINT_MIN_SLOT && slot <= FINGERPRINT_MAX_SLOT;
}

// Step names are shown by the web app — keep in sync with the frontend's
// ENROLL_STEPS.
void enrollSetStep(EnrollStep step, const char* stepName, uint32_t now) {
  enrollment.step = step;
  enrollment.stepStartedAt = now;
  Serial.printf("[ENROLL] slot %u: %s\n", enrollment.slot, stepName);
  reportCommand(enrollment.commandId, CommandState::InProgress, stepName);
}

void enrollFinish(bool success, const char* message) {
  Serial.printf("[ENROLL] slot %u %s: %s\n", enrollment.slot, success ? "done" : "failed", message);
  reportCommand(enrollment.commandId, success ? CommandState::Succeeded : CommandState::Failed, "", message);
  playFeedback(success ? SOUND_UNLOCK_OK : SOUND_REJECTED);
  enrollment.active = false;
  // The finger may still be on the sensor — make normal scanning wait for it
  // to lift, so the enrollment touch doesn't open the door.
  fingerprintState = FingerprintState::WaitForRemoval;
}

void startEnrollment(const DoorCommand& command, uint32_t now) {
  if (!fingerprintReady) {
    reportCommand(command.id, CommandState::Failed, "", "Fingerprint sensor not found");
    return;
  }
  if (enrollment.active) {
    reportCommand(command.id, CommandState::Failed, "", "Another enrollment is already running");
    return;
  }
  if (!isValidSlot(command.slot)) {
    reportCommand(command.id, CommandState::Failed, "", "Invalid fingerprint slot");
    return;
  }

  enrollment = {};
  enrollment.active = true;
  strlcpy(enrollment.commandId, command.id, sizeof(enrollment.commandId));
  enrollment.slot = static_cast<uint16_t>(command.slot);
  enrollSetStep(EnrollStep::WaitFirstFinger, "place_finger", now);
}

// Same polling approach as handleFingerprint(): one short sensor exchange
// per poll, the waiting is spread across loop passes.
void handleEnrollment(uint32_t now) {
  if (!enrollment.active || now - lastFingerprintPollAt < FINGERPRINT_POLL_INTERVAL_MS) {
    return;
  }
  lastFingerprintPollAt = now;

  if (now - enrollment.stepStartedAt >= ENROLL_STEP_TIMEOUT_MS) {
    enrollFinish(false, "Timed out waiting for the finger");
    return;
  }

  const uint8_t imageResult = finger.getImage();

  switch (enrollment.step) {
    case EnrollStep::WaitFirstFinger:
      // A blurry capture just gets retried on the next poll while the
      // finger is still down.
      if (imageResult == FINGERPRINT_OK && finger.image2Tz(1) == FINGERPRINT_OK) {
        enrollSetStep(EnrollStep::WaitRemoval, "remove_finger", now);
      }
      return;

    case EnrollStep::WaitRemoval:
      if (imageResult == FINGERPRINT_NOFINGER) {
        enrollSetStep(EnrollStep::WaitSecondFinger, "place_again", now);
      }
      return;

    case EnrollStep::WaitSecondFinger:
      if (imageResult != FINGERPRINT_OK || finger.image2Tz(2) != FINGERPRINT_OK) {
        return;
      }
      reportCommand(enrollment.commandId, CommandState::InProgress, "saving");
      if (finger.createModel() != FINGERPRINT_OK) {
        enrollFinish(false, "The two scans didn't match, try again");
        return;
      }
      if (finger.storeModel(enrollment.slot) != FINGERPRINT_OK) {
        enrollFinish(false, "Couldn't save the fingerprint on the sensor");
        return;
      }
      refreshTemplateCount();
      enrollFinish(true, "Fingerprint saved");
      return;
  }
}

void deleteFingerprint(const DoorCommand& command) {
  if (!fingerprintReady) {
    reportCommand(command.id, CommandState::Failed, "", "Fingerprint sensor not found");
    return;
  }
  if (!isValidSlot(command.slot)) {
    reportCommand(command.id, CommandState::Failed, "", "Invalid fingerprint slot");
    return;
  }

  const uint8_t result = finger.deleteModel(static_cast<uint16_t>(command.slot));
  if (result != FINGERPRINT_OK) {
    char message[48];
    snprintf(message, sizeof(message), "Sensor error 0x%02X while deleting", result);
    Serial.printf("[FINGERPRINT] delete ID %d failed (0x%02X)\n", command.slot, result);
    reportCommand(command.id, CommandState::Failed, "", message);
    return;
  }
  refreshTemplateCount();
  Serial.printf("[FINGERPRINT] deleted ID %d\n", command.slot);
  reportCommand(command.id, CommandState::Succeeded);
}

// One command per loop pass keeps each pass short.
void handleCommands(uint32_t now) {
  DoorCommand command;
  if (!linkTakeCommand(command)) {
    return;
  }

  switch (command.kind) {
    case CommandKind::Unlock:
      triggerUnlock(UnlockSource::Remote, now);
      // The backend logs the remote unlock itself (it knows who pressed it),
      // so no access event is sent from here.
      reportCommand(command.id, CommandState::Succeeded, "", "Door unlocked");
      break;
    case CommandKind::EnrollFingerprint:
      startEnrollment(command, now);
      break;
    case CommandKind::DeleteFingerprint:
      deleteFingerprint(command);
      break;
  }
}

void publishStatus(uint32_t now) {
  if (now - lastStatusPublishAt < STATUS_PUBLISH_INTERVAL_MS) {
    return;
  }
  lastStatusPublishAt = now;
  const DoorStatus status = {doorOpen, !relayUnlocked, fingerprintReady, fingerprintTemplateCount};
  linkPublishStatus(status);
}

// ============================================================================
// Exit button + door sensor
// ============================================================================

void handleExitButton(uint32_t now) {
  if (!debounceUpdate(exitButton, now)) {
    return;
  }
  if (exitButton.stableLevel == LOW) {  // press edge only; release is ignored
    Serial.println("[EXIT_BUTTON] pressed");
    triggerUnlock(UnlockSource::ExitButton, now);
    emitEvent(EventType::Granted, EventMethod::ExitButton);
  }
}

void handleDoorSensor(uint32_t now) {
  if (debounceUpdate(doorSensor, now)) {
    doorOpen = doorSensor.stableLevel != DOOR_CLOSED_LEVEL;
    Serial.printf("[DOOR_SENSOR] state changed: %s\n", doorOpen ? "OPEN" : "CLOSED");
    emitEvent(doorOpen ? EventType::DoorOpened : EventType::DoorClosed, EventMethod::None);

    if (doorOpen) {
      doorOpenedAt = now;
      leftOpenAlarmRaised = false;
      if (!isEntryAuthorized(now)) {
        raiseAlarm(AlarmType::ForcedOpen);
      }
    } else {
      leftOpenAlarmRaised = false;
    }
  }

  if (doorOpen && !leftOpenAlarmRaised && now - doorOpenedAt >= DOOR_LEFT_OPEN_TIMEOUT_MS) {
    leftOpenAlarmRaised = true;
    raiseAlarm(AlarmType::LeftOpen);
  }
}

// ============================================================================
// Setup
// ============================================================================

void printBootBanner() {
  Serial.println();
  Serial.println("==============================================");
  Serial.println(" Smart Door Controller — ESP32");
  Serial.println("==============================================");
  Serial.printf(" Keypad rows (out)      : GPIO%u, GPIO%u, GPIO%u, GPIO%u\n",
                PIN_KEYPAD_ROW1, PIN_KEYPAD_ROW2, PIN_KEYPAD_ROW3, PIN_KEYPAD_ROW4);
  Serial.printf(" Keypad cols (in, PU)   : GPIO%u, GPIO%u, GPIO%u\n",
                PIN_KEYPAD_COL1, PIN_KEYPAD_COL2, PIN_KEYPAD_COL3);
  Serial.printf(" Relay / EM lock (out)  : GPIO%u (active-%s)\n", PIN_RELAY, RELAY_ACTIVE_LOW ? "LOW" : "HIGH");
  Serial.printf(" Exit button (in, PU)   : GPIO%u\n", PIN_EXIT_BUTTON);
  Serial.printf(" Door contact (in, PU)  : GPIO%u\n", PIN_DOOR_SENSOR);
  Serial.printf(" DFPlayer TX/RX         : GPIO%u -> RX, GPIO%u <- TX\n", PIN_MP3_TX, PIN_MP3_RX);
  Serial.printf(" AS608 RX2/TX2          : GPIO%u <- TX, GPIO%u -> RX\n", PIN_FP_RX, PIN_FP_TX);
  Serial.printf(" Unlock pulse           : %lums\n", static_cast<unsigned long>(UNLOCK_DURATION_MS));
  Serial.printf(" Left-open timeout      : %lums\n", static_cast<unsigned long>(DOOR_LEFT_OPEN_TIMEOUT_MS));
  Serial.println("==============================================");
}

void initMp3() {
  Serial1.begin(MP3_BAUD, SERIAL_8N1, PIN_MP3_RX, PIN_MP3_TX);
  // Startup only: begin() with ACK on so a missing module is detected
  // (it waits for the module's init reply). ACK is then switched off so
  // play commands in loop() never wait for a reply.
  mp3Ready = mp3.begin(Serial1, /*isACK=*/true, /*doReset=*/true);
  if (!mp3Ready) {
    Serial.println("[MP3] module not found — check wiring and SD card");
    return;
  }
  // disableACK() is private in this library — re-running begin() with ACK
  // off and no reset is the supported way to switch it off.
  mp3.begin(Serial1, /*isACK=*/false, /*doReset=*/false);
  mp3.volume(MP3_VOLUME);
  Serial.printf("[MP3] ready, volume %u\n", MP3_VOLUME);
}

void initFingerprint() {
  Serial2.begin(FP_BAUD, SERIAL_8N1, PIN_FP_RX, PIN_FP_TX);
  // Startup only: begin() gives the sensor time to boot (it has a
  // one-off wait inside). Pins stay on GPIO16/17 (UART2 defaults).
  finger.begin(FP_BAUD);
  fingerprintReady = finger.verifyPassword();
  if (!fingerprintReady) {
    Serial.println("[FINGERPRINT] sensor not found — fingerprint unlock disabled");
    return;
  }
  refreshTemplateCount();
  Serial.printf("[FINGERPRINT] ready, %u templates stored\n", fingerprintTemplateCount);
}

void setup() {
  Serial.begin(115200);

  // Relay first so the lock is held from the earliest possible moment.
  pinMode(PIN_RELAY, OUTPUT);
  setRelayUnlocked(false);

  const uint32_t now = millis();
  debounceInit(exitButton, now);
  debounceInit(doorSensor, now);
  keypad.setDebounceTime(KEYPAD_DEBOUNCE_MS);

  printBootBanner();
#if KEYPAD_DIAGNOSTIC
  keypadDiagInit();
#endif
  accessListBegin();
  linkBegin();
  initMp3();
  initFingerprint();

  doorOpen = doorSensor.stableLevel != DOOR_CLOSED_LEVEL;
  doorOpenedAt = millis();
  Serial.printf("[DOOR_SENSOR] initial state: %s\n", doorOpen ? "OPEN" : "CLOSED");
  if (!accessListLoaded()) {
    Serial.println("[ACCESS] not synced yet — built-in DEFAULT_PIN works until the first sync");
  }
  Serial.println("[SYSTEM] ready");
}

// ============================================================================
// Loop — no delay() anywhere below
// ============================================================================

void loop() {
  const uint32_t now = millis();
#if KEYPAD_DIAGNOSTIC
  handleKeypadDiagnostic(now);
#else
  handleKeypad(now);
#endif
  handleExitButton(now);
  handleDoorSensor(now);
  handleCommands(now);
  handleEnrollment(now);
  handleFingerprint(now);
  handleRelay(millis());
  publishStatus(millis());
}
