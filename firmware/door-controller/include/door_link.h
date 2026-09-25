#pragma once

// Link between the door logic (main loop, core 1) and the backend (network
// task, core 0). Everything here is non-blocking for the caller: the main
// loop only ever pushes into / pops from FreeRTOS queues, and all HTTP work
// happens on the network task, so a slow or dead server never stalls the
// keypad, relay or door sensor.

#include <Arduino.h>

constexpr size_t MEMBER_ID_LENGTH = 36;  // UUID "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
constexpr size_t COMMAND_ID_LENGTH = 36;

// ---- Events (door -> backend) ----------------------------------------------
// Names must match the backend's AccessEventType / AccessMethod enums.
enum class EventType : uint8_t { Granted, Denied, ForcedOpen, LeftOpen, DoorOpened, DoorClosed };
enum class EventMethod : uint8_t { None, Keypad, Fingerprint, ExitButton };

struct DoorEvent {
  EventType type;
  EventMethod method;
  int16_t fingerprintSlot;                // -1 = none
  char memberId[MEMBER_ID_LENGTH + 1];    // "" = none
  uint32_t at;                            // millis() when it happened
};

// ---- Commands (backend -> door) --------------------------------------------
enum class CommandKind : uint8_t { Unlock, EnrollFingerprint, DeleteFingerprint };

struct DoorCommand {
  char id[COMMAND_ID_LENGTH + 1];
  CommandKind kind;
  int16_t slot;  // -1 = none
};

// ---- Command progress (door -> backend) ------------------------------------
enum class CommandState : uint8_t { InProgress, Succeeded, Failed };

struct CommandReport {
  char id[COMMAND_ID_LENGTH + 1];
  CommandState state;
  char step[24];     // enrollment step name, "" = none
  char message[64];  // "" = none
};

// ---- Live status (main loop writes, heartbeat reads) -----------------------
struct DoorStatus {
  bool doorOpen;
  bool locked;
  bool fingerprintReady;
  uint16_t templateCount;
};

// Starts WiFi and the network task. Call once from setup(), after
// accessListBegin().
void linkBegin();

void linkPublishStatus(const DoorStatus& status);

// Drops the event (and logs it) if the queue is full — never blocks.
void linkQueueEvent(const DoorEvent& event);
void linkReportCommand(const CommandReport& report);

// Returns true and fills `out` when a command from the backend is waiting.
bool linkTakeCommand(DoorCommand& out);
