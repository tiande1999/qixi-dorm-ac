#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include <vector>
#include "wire_protocol.h"

struct IrProfile {
  decode_type_t protocol = UNKNOWN;
  uint16_t bits = 0;
  uint64_t value = 0;
  std::vector<uint8_t> state;
  std::vector<uint16_t> raw;
  uint16_t khz = 38;
  bool forceRaw = false, verified = false;
  uint8_t attestations = 0;
  String id;

  bool capture(const decode_results& result) {
    if (result.overflow || result.repeat || result.rawlen < 8) return false;
    uint16_t length = getCorrectedRawLength(&result);
    if (length < 7 || length > 1024) return false;
    uint16_t* timings = resultToRawArray(&result);
    if (!timings) return false;
    raw.assign(timings, timings + length);
    delete[] timings;
    protocol = result.decode_type;
    bits = result.bits;
    value = result.value;
    state.clear();
    if (hasACState(protocol)) {
      const size_t bytes = (bits + 7) / 8;
      if (bytes == 0 || bytes > sizeof(result.state)) return false;
      state.assign(result.state, result.state + bytes);
    }
    forceRaw = protocol == UNKNOWN;
    verified = false;
    attestations = 0;
    return true;
  }

  bool equivalent(const IrProfile& other) const {
    if (protocol != other.protocol || bits != other.bits) return false;
    if (!forceRaw) return state.empty() ? value == other.value : state == other.state;
    if (raw.size() != other.raw.size()) return false;
    for (size_t i = 0; i < raw.size(); ++i) {
      uint32_t a = raw[i], b = other.raw[i];
      if ((a > b ? a - b : b - a) > a / 4 + 100) return false;
    }
    return true;
  }

  bool valid() const {
    if (raw.size() < 7 || raw.size() > 1024 || (khz != 36 && khz != 38 && khz != 40)) return false;
    uint32_t total = 0;
    for (uint16_t pulse : raw) total += pulse;
    if (total > 1000000) return false;
    if (hasACState(protocol) && (state.empty() || state.size() != (bits + 7U) / 8U)) return false;
    if (!hasACState(protocol) && protocol != UNKNOWN && bits > 64) return false;
    return true;
  }

  bool send(IRsend& sender) {
    if (!valid()) return false;
    if (!forceRaw) {
      const bool sent = state.empty()
          ? sender.send(protocol, value, bits, IRsend::minRepeats(protocol))
          : sender.send(protocol, state.data(), state.size());
      if (sent) return true;
      // A fallback is selected only during unverified, supervised learning.
      if (verified) return false;
      forceRaw = true;
    }
    sender.sendRaw(raw.data(), raw.size(), khz);
    return true;
  }

  void toJson(JsonDocument& doc) const {
    doc["format"] = 1;
    doc["library"] = "IRremoteESP8266-2.8.6";
    doc["protocol"] = static_cast<int>(protocol);
    doc["bits"] = bits;
    char number[17];
    snprintf(number, sizeof(number), "%016llX", static_cast<unsigned long long>(value));
    doc["value"] = number;
    String hex;
    for (uint8_t b : state) { char pair[3]; snprintf(pair, sizeof(pair), "%02X", b); hex += pair; }
    doc["state"] = hex;
    JsonArray timings = doc.createNestedArray("raw");
    for (uint16_t duration : raw) timings.add(duration);
    doc["khz"] = khz;
    doc["force_raw"] = forceRaw;
    doc["verified"] = verified;
    doc["attestations"] = attestations;
  }

  bool save() {
    DynamicJsonDocument doc(20000);
    toJson(doc);
    if (doc.overflowed()) return false;
    String body;
    serializeJson(doc, body);
    uint16_t checksum = crc16(reinterpret_cast<const uint8_t*>(body.c_str()), body.length());
    File file = LittleFS.open("/profile.tmp", "w");
    if (!file) return false;
    char suffix[7]; snprintf(suffix, sizeof(suffix), "*%04X\n", checksum);
    bool written = file.print(body) == body.length() && file.print(suffix) == 6;
    file.flush(); file.close();
    if (!written) return false;
    // Power loss may leave no profile, which boots UNPAIRED, never a partial OFF.
    LittleFS.remove("/profile.json");
    if (!LittleFS.rename("/profile.tmp", "/profile.json")) return false;
    char key[9]; snprintf(key, sizeof(key), "%08X", checksum);
    id = key;
    return true;
  }

  bool load() {
    File file = LittleFS.open("/profile.json", "r");
    if (!file || file.size() > 18000) return false;
    String text = file.readString(); file.close();
    const size_t n = text.length();
    if (n < 7 || text[n - 1] != '\n' || text[n - 6] != '*') return false;
    String hexCrc = text.substring(n - 5, n - 1);
    uint16_t expected = strtoul(hexCrc.c_str(), nullptr, 16);
    text.remove(n - 6);
    if (crc16(reinterpret_cast<const uint8_t*>(text.c_str()), text.length()) != expected) return false;
    DynamicJsonDocument doc(20000);
    if (deserializeJson(doc, text) || doc["format"] != 1 ||
        String(doc["library"] | "") != "IRremoteESP8266-2.8.6") return false;
    protocol = static_cast<decode_type_t>(doc["protocol"].as<int>());
    bits = doc["bits"] | 0;
    value = strtoull(doc["value"] | "0", nullptr, 16);
    khz = doc["khz"] | 0;
    forceRaw = doc["force_raw"] | true;
    attestations = doc["attestations"] | 0;
    verified = (doc["verified"] | false) && attestations == 7;
    String hex = doc["state"] | "";
    if (hex.length() % 2 || hex.length() > 256) return false;
    state.clear(); raw.clear();
    for (size_t i = 0; i < hex.length(); i += 2)
      state.push_back(strtoul(hex.substring(i, i + 2).c_str(), nullptr, 16));
    for (JsonVariant item : doc["raw"].as<JsonArray>()) {
      if (!item.is<unsigned int>() || item.as<unsigned int>() > 65535 || raw.size() >= 1024) return false;
      raw.push_back(item.as<uint16_t>());
    }
    char key[9]; snprintf(key, sizeof(key), "%08X", expected); id = key;
    return valid();
  }
};
