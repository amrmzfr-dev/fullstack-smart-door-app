#pragma once

// Who may open the door, synced from the backend and kept in NVS so the door
// keeps working through network or server outages (and reboots during one).
//
// Written by the network task, read by the main loop — every function here
// is safe to call from either.

#include <Arduino.h>

#include "door_link.h"

constexpr size_t ACCESS_MAX_PINS = 40;
constexpr size_t ACCESS_MAX_FINGERPRINT_SLOTS = 128;
constexpr size_t ACCESS_VERSION_LENGTH = 16;
constexpr size_t PIN_SALT_LENGTH = 16;  // hex chars

struct AccessPin {
  char memberId[MEMBER_ID_LENGTH + 1];
  char salt[PIN_SALT_LENGTH + 1];
  uint8_t hash[32];  // SHA-256(salt + pin)
};

struct AccessListData {
  char version[ACCESS_VERSION_LENGTH + 1];
  AccessPin pins[ACCESS_MAX_PINS];
  uint8_t pinCount;
  uint16_t fingerprintSlots[ACCESS_MAX_FINGERPRINT_SLOTS];
  uint8_t fingerprintSlotCount;
};

// Loads the last synced list from NVS. Call once from setup().
void accessListBegin();

// false = never synced from the backend yet. The firmware then falls back to
// its built-in DEFAULT_PIN and accepts any enrolled fingerprint, so a fresh
// door works before it has ever reached the server.
bool accessListLoaded();

// Copies the version string into `out` ("" when not loaded).
void accessListVersion(char* out, size_t outSize);

// Replaces the list (in RAM and NVS). Network task only.
void accessListReplace(const AccessListData& data);

// Checks a keypad PIN against every synced hash. On a match, copies the
// member ID into `memberIdOut`.
bool accessCheckPin(const char* pin, char* memberIdOut, size_t memberIdOutSize);

bool accessFingerprintAllowed(uint16_t slot);

// Parses 64 hex chars into 32 bytes. Returns false on bad input.
bool accessParseHash(const char* hex, uint8_t out[32]);
