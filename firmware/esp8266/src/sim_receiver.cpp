#include <Arduino.h>
#include <IRrecv.h>
#include "sim_ir.h"

constexpr uint8_t kReceiverPin = 13;
IRrecv receiver(kReceiverPin);
decode_results frame;
// Bench fixture starts as a running simulated AC on every reset.
bool on = true;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.begin(115200);
  receiver.enableIRIn();
  Serial.println("SIM_RX READY / initial ON (no IR received)");
}

void loop() {
  if (!receiver.decode(&frame)) return;
  if (frame.decode_type == NEC && frame.bits == 32 && !frame.repeat &&
      knownSimulationCode(static_cast<uint32_t>(frame.value))) {
    on = nextSimulationState(static_cast<uint32_t>(frame.value), on);
    digitalWrite(LED_BUILTIN, on ? LOW : HIGH);
    Serial.println(on ? "SIM_RX ON" : "SIM_RX OFF");
  } else {
    Serial.println("SIM_RX IGNORED");
  }
  receiver.resume();
}
