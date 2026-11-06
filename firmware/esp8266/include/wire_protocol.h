#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

inline uint16_t crc16(const uint8_t* data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; ++i) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit)
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return crc;
}

class WireReader {
 public:
  static const size_t kMax = 384;
  bool feed(char ch, JsonDocument& doc) {
    if (dropping_) {
      if (ch == '\n') dropping_ = false;
      return false;
    }
    if (used_ >= kMax - 1 && ch != '\n') {
      used_ = 0; dropping_ = true; ++errors; return false;
    }
    if (ch != '\n') { buffer_[used_++] = ch; return false; }
    const size_t n = used_;
    used_ = 0;
    if (n < 7 || buffer_[n - 5] != '*') { ++errors; return false; }
    uint16_t expected = 0;
    for (size_t i = n - 4; i < n; ++i) {
      char c = buffer_[i];
      int d = c >= '0' && c <= '9' ? c - '0' :
              c >= 'A' && c <= 'F' ? c - 'A' + 10 :
              c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
      if (d < 0) { ++errors; return false; }
      expected = (expected << 4) | d;
    }
    if (crc16(reinterpret_cast<uint8_t*>(buffer_), n - 5) != expected) {
      ++errors; return false;
    }
    for (size_t i = 0; i < n - 5; ++i)
      if (buffer_[i] < 32 || buffer_[i] > 126) { ++errors; return false; }
    buffer_[n - 5] = '\0';
    doc.clear();
    if (deserializeJson(doc, buffer_) || !doc["v"].is<int>() || doc["v"] != 1 ||
        !doc["t"].is<const char*>() || strlen(doc["t"]) != 1) {
      ++errors; return false;
    }
    return true;
  }
  uint32_t errors = 0;
 private:
  char buffer_[kMax] = {};
  size_t used_ = 0;
  bool dropping_ = false;
};

inline void writeFrame(Print& stream, const JsonDocument& doc) {
  String body;
  serializeJson(doc, body);
  if (body.length() + 6 > WireReader::kMax) return;
  char suffix[7];
  snprintf(suffix, sizeof(suffix), "*%04X\n",
           crc16(reinterpret_cast<const uint8_t*>(body.c_str()), body.length()));
  stream.print(body);
  stream.print(suffix);
}
