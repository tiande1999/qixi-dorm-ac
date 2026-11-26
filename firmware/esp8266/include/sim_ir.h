#pragma once
#include <stdint.h>

constexpr uint32_t kSimOn = 0x52AD18E7;
constexpr uint32_t kSimOff = 0x52AD38C7;

constexpr bool knownSimulationCode(uint32_t code) {
  return code == kSimOn || code == kSimOff;
}

constexpr bool nextSimulationState(uint32_t code, bool on) {
  return knownSimulationCode(code) ? code == kSimOn : on;
}

// These assertions are checked by every ESP build.
static_assert(nextSimulationState(kSimOn, false), "ON must turn LED on");
static_assert(!nextSimulationState(kSimOff, true), "OFF must turn LED off");
static_assert(!nextSimulationState(kSimOff, false), "Repeated OFF stays off");
static_assert(nextSimulationState(0, true) && !nextSimulationState(0, false),
              "Unknown code must preserve LED state");
