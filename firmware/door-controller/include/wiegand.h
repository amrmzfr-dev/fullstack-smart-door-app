#pragma once

// Wiegand reader input (the D0 / D1 wires of a keypad or card reader such as
// the Belco). Each key press or card swipe arrives as a short burst of pulses:
// a pulse on D0 is a 0 bit, a pulse on D1 is a 1 bit. A burst is finished when
// the lines stay quiet for a few milliseconds.

#include <Arduino.h>

struct WiegandFrame {
  uint8_t bits;    // how many bits arrived (4 / 8 = one key, 26 / 34 = a card)
  uint64_t value;  // the bits, first bit received = highest
};

// Starts listening on the two pins. `inverted` = the lines come through a
// transistor, so a pulse is a rising edge instead of a falling one.
void wiegandBegin(uint8_t pinD0, uint8_t pinD1, bool inverted);

// Returns true and fills `out` once a finished burst is waiting. Never blocks.
bool wiegandTakeFrame(WiegandFrame& out);
