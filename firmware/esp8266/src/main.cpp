#include <Arduino.h>
#include <ESP8266WiFi.h>
extern "C" {
#include <user_interface.h>
}
#include <SoftwareSerial.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <IRrecv.h>
#include <IRsend.h>
#include "wire_protocol.h"
#include "execution_guard.h"
#include "ir_profile.h"
#include "sim_ir.h"

constexpr uint8_t kIrTx = 14, kIrRx = 13, kLinkRx = 12, kLinkTx = 16;
EspSoftwareSerial::UART linkPort;
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
IRrecv receiver(kIrRx, 1536, 50, true);
IRsend sender(kIrTx);
decode_results decoded;
WireReader reader;
ExecutionGuard guard;
IrProfile profile;
String bootId, hostId, stage = "IDLE", lastError;
bool storageReady = false, displayReady = false, learning = false;
bool firstCapture = false, secondCapture = false;
uint32_t lastHost = 0, lastManualOp = 0, lastCapture = 0;
uint8_t testPhase = 0;
bool awaitingAttestation = false;
uint32_t preparedVersion = 0;
uint32_t retiredHosts[16] = {};
uint8_t retiredCount = 0;
String lastAcceptedHost;

#if defined(QIXI_SIM_TX)
constexpr bool kSimTxEnabled = true;
#else
constexpr bool kSimTxEnabled = false;
#endif

String hexId(uint32_t value) {
  char text[9]; snprintf(text, sizeof(text), "%08X", value); return String(text);
}

bool validId(const String& id) {
  if (id.length() != 8) return false;
  for (char c : id) if (!isxdigit(c)) return false;
  return true;
}

bool ready() {
  return storageReady && !LittleFS.exists("/learning.lock") &&
         !learning && profile.verified && profile.valid();
}

void reply(const char* type, uint32_t id = 0, const char* result = nullptr) {
  StaticJsonDocument<384> doc;
  doc["v"] = 1; doc["t"] = type; doc["e"] = hostId; doc["s"] = bootId;
  if (id) doc["id"] = id;
  if (result) doc["result"] = result;
  writeFrame(linkPort, doc);
}

void fail(const char* reason, uint32_t id = 0) {
  lastError = reason;
  StaticJsonDocument<384> doc;
  doc["v"] = 1; doc["t"] = "E"; doc["e"] = hostId; doc["s"] = bootId;
  doc["id"] = id; doc["err"] = reason;
  writeFrame(linkPort, doc);
  Serial.printf("ERROR %s id=%u\n", reason, id);
}

bool transmitSimulation() {
  if (!kSimTxEnabled) return false;
  receiver.disableIRIn();
  sender.sendNEC(kSimOff, 32);
  digitalWrite(kIrTx, LOW);
  receiver.enableIRIn();
  receiver.resume();
  return true;
}

void abortLearning() {
  learning = false;
  profile.verified = false;
  awaitingAttestation = false;
  stage = "UNPAIRED";
  guard.cancel();
  // Keep learning.lock until a complete new verification succeeds.
}

void learnCommand(const JsonDocument& doc) {
  const uint32_t op = doc["op"] | 0U;
  if (op == 0 || op <= lastManualOp) { fail("duplicate_manual_op"); return; }
  lastManualOp = op;
  const String action = doc["action"] | "";
  guard.cancel();
  if (action == "start") {
    if (!storageReady) { fail("filesystem_unavailable"); return; }
    File lock = LittleFS.open("/learning.lock", "w");
    if (!lock || lock.print("unverified\n") != 11) { fail("cannot_lock_profile"); return; }
    lock.flush(); lock.close();
    profile = IrProfile();
    learning = true; firstCapture = secondCapture = false;
    testPhase = 0; awaitingAttestation = false;
    stage = "CAPTURE_1"; lastError = "";
    receiver.resume();
  } else if (action == "abort") {
    abortLearning();
  } else if (!learning) {
    fail("not_learning");
  } else if (action == "frequency") {
    const uint16_t khz = doc["khz"] | 0;
    if (khz != 36 && khz != 38 && khz != 40) { fail("bad_carrier"); return; }
    profile.khz = khz;
    profile.forceRaw = true;
    profile.attestations = 0; testPhase = 0; awaitingAttestation = false;
    stage = secondCapture ? "TEST_ON" : (firstCapture ? "CAPTURE_2" : "CAPTURE_1");
  } else if (action == "test") {
    fail("real_tx_disabled");
  } else if (action == "confirm") {
    if (awaitingAttestation) {
      profile.attestations |= (1U << testPhase);
      ++testPhase; awaitingAttestation = false;
      stage = testPhase == 1 ? "TEST_ALREADY_OFF" : testPhase == 2 ? "TEST_OTHER_MODE" : "OK_TO_SAVE";
    } else if (testPhase == 3 && profile.attestations == 7 && secondCapture) {
      profile.verified = true;
      if (!profile.save()) { profile.verified = false; fail("profile_save_failed"); return; }
      if (!LittleFS.remove("/learning.lock")) { profile.verified = false; fail("profile_unlock_failed"); return; }
      learning = false; stage = "VERIFIED"; lastError = "";
      Serial.printf("PROFILE_VERIFIED %s / MANUAL OBSERVATIONS\n", profile.id.c_str());
    } else {
      fail("observe_test_first");
    }
  } else fail("unknown_learn_action");
}

void handle(const JsonDocument& doc) {
  const String type = doc["t"] | "";
  const String host = doc["e"] | "";
  if (!validId(host)) return;
  const uint32_t now = millis();
  if (type == "h") {
    if (!doc["q"].is<uint32_t>()) return;
    if (host != lastAcceptedHost) {
      const uint32_t candidate = strtoul(host.c_str(), nullptr, 16);
      for (uint8_t i = 0; i < retiredCount; ++i)
        if (candidate == retiredHosts[i]) return;
      if (lastAcceptedHost.length()) {
        if (retiredCount == 16) { fail("session_table_full"); return; }
        retiredHosts[retiredCount++] = strtoul(lastAcceptedHost.c_str(), nullptr, 16);
      }
      lastAcceptedHost = host;
      guard.reset(); lastManualOp = 0;
      if (learning) abortLearning();
    }
    hostId = host;
    lastHost = now;
    StaticJsonDocument<512> ack;
    ack["v"] = 1; ack["t"] = "H"; ack["e"] = hostId; ack["s"] = bootId;
    ack["q"] = doc["q"]; ack["ok"] = ready(); ack["p"] = profile.id; ack["sim"] = kSimTxEnabled;
    ack["stage"] = stage; ack["err"] = lastError;
    writeFrame(linkPort, ack);
    return;
  }
  if (host != hostId || String(doc["s"] | "") != bootId || now - lastHost >= 3000) return;
  if (type == "S") {
    if (!displayReady) return;
    oled.clearDisplay(); oled.setCursor(0, 0);
    uint8_t line = 0;
    for (JsonVariantConst item : doc["lines"].as<JsonArrayConst>()) {
      if (++line > 6) break;
      String text = item.as<String>(); text.remove(21);
      oled.println(text);
    }
    oled.display();
    return;
  }
  if (type == "L") { learnCommand(doc); return; }
  if (type == "X") { guard.cancel(); return; }
  const uint32_t id = doc["id"] | 0U;
  if (type != "P" && type != "C") return;
  if (!kSimTxEnabled || String(doc["mode"] | "") != "SIM_AUTO" ||
      String(doc["action"] | "") != "SIM_OFF" || !doc["sv"].is<uint32_t>()) {
    fail("unsupported_action", id);
    return;
  }
  const uint32_t stateVersion = doc["sv"].as<uint32_t>();
  if (type == "P") {
    const uint32_t token = os_random();
    if (!guard.prepare(id, token, now)) { fail("old_command", id); return; }
    preparedVersion = stateVersion;
    StaticJsonDocument<384> ack;
    ack["v"] = 1; ack["t"] = "R"; ack["e"] = hostId; ack["s"] = bootId;
    ack["id"] = id; ack["k"] = hexId(token); ack["sv"] = preparedVersion;
    writeFrame(linkPort, ack);
  } else if (type == "C") {
    const String key = doc["k"] | "";
    if (stateVersion != preparedVersion || !validId(key) || !guard.commit(id, strtoul(key.c_str(), nullptr, 16), now)) {
      fail("expired_or_replayed", id); return;
    }
    // Nothing is queued. This is the only automatic infrared execution site.
    if (transmitSimulation()) reply("A", id, "ir_tx_finished");
    else fail("ir_send_failed", id);
  }
}

void setup() {
  pinMode(kIrTx, OUTPUT); digitalWrite(kIrTx, LOW);
  Serial.begin(115200);
  WiFi.persistent(false); WiFi.mode(WIFI_OFF);
  bootId = hexId(os_random());
  linkPort.begin(9600, SWSERIAL_8N1, kLinkRx, kLinkTx, false, 512);
  Wire.begin(4, 5); Wire.setClock(400000);
  displayReady = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (displayReady) {
    oled.clearDisplay(); oled.setTextSize(1); oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(0, 0); oled.println("DORM AC: waiting EG"); oled.display();
  }
  // Do not auto-format an unreadable filesystem: it may contain a pairing lock.
  LittleFSConfig fsConfig; fsConfig.setAutoFormat(false); LittleFS.setConfig(fsConfig);
  storageReady = LittleFS.begin();
  if (storageReady && !profile.load()) profile = IrProfile();
  if (storageReady && LittleFS.exists("/learning.lock")) profile.verified = false;
  stage = ready() ? "VERIFIED" : "UNPAIRED";
  if (!storageReady) lastError = "FORMAT_FS_USB";
  sender.begin(); receiver.enableIRIn();
  Serial.println("USB commands: STATUS / FORMAT_FS (erases IR profile only)");
}

void loop() {
  const uint32_t now = millis();
  guard.expire(now);
  if (hostId.length() && now - lastHost >= 3000) {
    guard.cancel();
    if (learning) abortLearning();
    hostId = "";
    if (displayReady) {
      oled.clearDisplay(); oled.setCursor(0, 0); oled.println("EG LINK LOST"); oled.display();
    }
  }
  StaticJsonDocument<768> incoming;
  // Bound work per loop; serial data beyond a complete frame never becomes an action.
  for (uint16_t n = 0; n < 512 && linkPort.available(); ++n)
    if (reader.feed(static_cast<char>(linkPort.read()), incoming)) handle(incoming);

  if (receiver.decode(&decoded)) {
    if (learning && !secondCapture && (!firstCapture || now - lastCapture >= 1500)) {
      IrProfile candidate;
      candidate.khz = profile.khz;
      if (candidate.capture(decoded) && candidate.valid()) {
        if (!firstCapture) {
          profile = candidate; firstCapture = true; stage = "CAPTURE_2";
        } else if (profile.equivalent(candidate)) {
          secondCapture = true; stage = "TEST_ON"; lastError = "";
        } else {
          profile = candidate; stage = "CAPTURE_2"; lastError = "CAPTURE_MISMATCH";
        }
        lastCapture = now;
        Serial.printf("CAPTURE protocol=%d bits=%u raw=%u stage=%s\n",
                      static_cast<int>(candidate.protocol), candidate.bits,
                      static_cast<unsigned>(candidate.raw.size()), stage.c_str());
      } else lastError = "CAPTURE_INVALID";
    }
    receiver.resume();
  }
  static String usbLine;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n') {
      usbLine.trim();
      if (usbLine == "FORMAT_FS" && hostId.isEmpty()) {
        guard.cancel(); profile = IrProfile();
        storageReady = LittleFS.format() && LittleFS.begin();
        stage = "UNPAIRED"; lastError = storageReady ? "" : "FORMAT_FAILED";
        Serial.println(storageReady ? "FS_READY_UNPAIRED" : "FS_ERROR");
      } else if (usbLine == "STATUS") {
        Serial.printf("stage=%s verified=%d profile=%s error=%s\n", stage.c_str(),
                      ready(), profile.id.c_str(), lastError.c_str());
      } else Serial.println("Unknown command, or disconnect EG before FORMAT_FS");
      usbLine = "";
    } else if (usbLine.length() < 80) usbLine += ch;
  }
  yield();
}
