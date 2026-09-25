#include "access_list.h"

#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <mbedtls/sha256.h>
#include <mbedtls/version.h>

namespace {

constexpr char NVS_NAMESPACE[] = "access";
constexpr char KEY_LOADED[] = "loaded";
constexpr char KEY_VERSION[] = "version";
constexpr char KEY_PIN_COUNT[] = "pinCount";
constexpr char KEY_PINS[] = "pins";
constexpr char KEY_SLOT_COUNT[] = "slotCount";
constexpr char KEY_SLOTS[] = "slots";

AccessListData current = {};
bool loaded = false;
SemaphoreHandle_t lock = nullptr;

// Held only for a memcpy or a few dozen SHA-256 runs (well under a
// millisecond), so waiting forever on it can't stall the main loop.
class LockGuard {
 public:
  LockGuard() { xSemaphoreTake(lock, portMAX_DELAY); }
  ~LockGuard() { xSemaphoreGive(lock); }
  LockGuard(const LockGuard&) = delete;
  LockGuard& operator=(const LockGuard&) = delete;
};

void sha256(const uint8_t* data, size_t length, uint8_t out[32]) {
#if MBEDTLS_VERSION_MAJOR >= 3
  mbedtls_sha256(data, length, out, 0);
#else
  mbedtls_sha256_ret(data, length, out, 0);
#endif
}

uint8_t clampCount(uint8_t value, size_t max) {
  return value > max ? static_cast<uint8_t>(max) : value;
}

int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

void saveToNvs(const AccessListData& data) {
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, false)) {
    Serial.println("[ACCESS] NVS open failed, list kept in RAM only");
    return;
  }
  prefs.putString(KEY_VERSION, data.version);
  prefs.putUChar(KEY_PIN_COUNT, data.pinCount);
  prefs.putUChar(KEY_SLOT_COUNT, data.fingerprintSlotCount);
  // Zero-length blobs aren't allowed, so an empty list removes the key.
  if (data.pinCount > 0) {
    prefs.putBytes(KEY_PINS, data.pins, data.pinCount * sizeof(AccessPin));
  } else {
    prefs.remove(KEY_PINS);
  }
  if (data.fingerprintSlotCount > 0) {
    prefs.putBytes(KEY_SLOTS, data.fingerprintSlots, data.fingerprintSlotCount * sizeof(uint16_t));
  } else {
    prefs.remove(KEY_SLOTS);
  }
  prefs.putBool(KEY_LOADED, true);
  prefs.end();
}

}  // namespace

void accessListBegin() {
  lock = xSemaphoreCreateMutex();

  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, true)) {
    Serial.println("[ACCESS] no saved access list yet");
    return;
  }

  if (prefs.getBool(KEY_LOADED, false)) {
    // ~3.7KB — static so it doesn't eat the setup() task's stack.
    static AccessListData data;
    memset(&data, 0, sizeof(data));
    prefs.getString(KEY_VERSION, data.version, sizeof(data.version));
    data.pinCount = clampCount(prefs.getUChar(KEY_PIN_COUNT, 0), ACCESS_MAX_PINS);
    data.fingerprintSlotCount = clampCount(prefs.getUChar(KEY_SLOT_COUNT, 0), ACCESS_MAX_FINGERPRINT_SLOTS);

    const size_t pinBytes = data.pinCount * sizeof(AccessPin);
    const size_t slotBytes = data.fingerprintSlotCount * sizeof(uint16_t);
    const bool pinsOk = pinBytes == 0 || prefs.getBytes(KEY_PINS, data.pins, pinBytes) == pinBytes;
    const bool slotsOk = slotBytes == 0 || prefs.getBytes(KEY_SLOTS, data.fingerprintSlots, slotBytes) == slotBytes;

    if (pinsOk && slotsOk) {
      current = data;
      loaded = true;
      Serial.printf("[ACCESS] loaded saved list %s: %u PINs, %u fingerprints\n", current.version,
                    current.pinCount, current.fingerprintSlotCount);
    } else {
      Serial.println("[ACCESS] saved list is corrupt, ignoring it until the next sync");
    }
  }
  prefs.end();
}

bool accessListLoaded() {
  LockGuard guard;
  return loaded;
}

void accessListVersion(char* out, size_t outSize) {
  LockGuard guard;
  strlcpy(out, loaded ? current.version : "", outSize);
}

void accessListReplace(const AccessListData& data) {
  {
    LockGuard guard;
    current = data;
    loaded = true;
  }
  // NVS write happens outside the lock — it can take a few ms and only this
  // (network) task ever writes.
  saveToNvs(data);
  Serial.printf("[ACCESS] synced list %s: %u PINs, %u fingerprints\n", data.version, data.pinCount,
                data.fingerprintSlotCount);
}

bool accessCheckPin(const char* pin, char* memberIdOut, size_t memberIdOutSize) {
  const size_t pinLength = strlen(pin);
  char salted[PIN_SALT_LENGTH + 16];
  uint8_t digest[32];
  int matchIndex = -1;

  LockGuard guard;
  // Every entry is hashed and compared in full, even after a match, so the
  // time taken doesn't hint at which (or whether an) entry matched.
  for (uint8_t i = 0; i < current.pinCount; i++) {
    const AccessPin& entry = current.pins[i];
    const size_t saltLength = strnlen(entry.salt, PIN_SALT_LENGTH);
    memcpy(salted, entry.salt, saltLength);
    memcpy(salted + saltLength, pin, pinLength);
    sha256(reinterpret_cast<const uint8_t*>(salted), saltLength + pinLength, digest);

    uint8_t diff = 0;
    for (size_t b = 0; b < sizeof(digest); b++) {
      diff |= static_cast<uint8_t>(digest[b] ^ entry.hash[b]);
    }
    if (diff == 0 && matchIndex < 0) {
      matchIndex = i;
    }
  }

  if (matchIndex < 0) {
    return false;
  }
  strlcpy(memberIdOut, current.pins[matchIndex].memberId, memberIdOutSize);
  return true;
}

bool accessFingerprintAllowed(uint16_t slot) {
  LockGuard guard;
  for (uint8_t i = 0; i < current.fingerprintSlotCount; i++) {
    if (current.fingerprintSlots[i] == slot) {
      return true;
    }
  }
  return false;
}

bool accessParseHash(const char* hex, uint8_t out[32]) {
  if (hex == nullptr || strlen(hex) != 64) {
    return false;
  }
  for (size_t i = 0; i < 32; i++) {
    const int high = hexValue(hex[i * 2]);
    const int low = hexValue(hex[i * 2 + 1]);
    if (high < 0 || low < 0) {
      return false;
    }
    out[i] = static_cast<uint8_t>((high << 4) | low);
  }
  return true;
}
