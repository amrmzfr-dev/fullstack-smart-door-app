#include "wiegand.h"

namespace {

// Real Wiegand pulses are ~50-100us wide, 1-2ms apart. A pause this long means
// the burst is over.
constexpr uint32_t FRAME_GAP_US = 25000;
constexpr uint8_t MAX_BITS = 64;

portMUX_TYPE wiegandMux = portMUX_INITIALIZER_UNLOCKED;
volatile uint64_t receivedBits = 0;
volatile uint8_t receivedCount = 0;
volatile uint32_t lastBitAtUs = 0;

void IRAM_ATTR addBit(bool one) {
  portENTER_CRITICAL_ISR(&wiegandMux);
  if (receivedCount < MAX_BITS) {
    receivedBits = (receivedBits << 1) | (one ? 1ULL : 0ULL);
    receivedCount = receivedCount + 1;
  }
  lastBitAtUs = micros();
  portEXIT_CRITICAL_ISR(&wiegandMux);
}

void IRAM_ATTR onD0Pulse() {
  addBit(false);
}

void IRAM_ATTR onD1Pulse() {
  addBit(true);
}

}  // namespace

void wiegandBegin(uint8_t pinD0, uint8_t pinD1, bool inverted) {
  pinMode(pinD0, INPUT_PULLUP);
  pinMode(pinD1, INPUT_PULLUP);
  const int edge = inverted ? RISING : FALLING;
  attachInterrupt(digitalPinToInterrupt(pinD0), onD0Pulse, edge);
  attachInterrupt(digitalPinToInterrupt(pinD1), onD1Pulse, edge);
}

bool wiegandTakeFrame(WiegandFrame& out) {
  bool ready = false;
  portENTER_CRITICAL(&wiegandMux);
  if (receivedCount > 0 && micros() - lastBitAtUs > FRAME_GAP_US) {
    out.bits = receivedCount;
    out.value = receivedBits;
    receivedBits = 0;
    receivedCount = 0;
    ready = true;
  }
  portEXIT_CRITICAL(&wiegandMux);
  return ready;
}
