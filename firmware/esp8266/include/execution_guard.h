#pragma once
#include <stdint.h>

// Independent of Arduino so the exact production guard can also be host-tested.
class ExecutionGuard {
 public:
  void reset() { active_ = false; highWater_ = 0; }
  void cancel() { active_ = false; }
  bool prepare(uint32_t id, uint32_t token, uint32_t now) {
    if (id == 0 || id <= highWater_) return false;
    highWater_ = id;
    token_ = token;
    since_ = now;
    active_ = true;
    return true;
  }
  bool commit(uint32_t id, uint32_t token, uint32_t now) {
    if (!active_ || id != highWater_ || token != token_ ||
        static_cast<uint32_t>(now - since_) >= 2000) return false;
    active_ = false;  // Consume BEFORE the first irreversible infrared pulse.
    return true;
  }
  void expire(uint32_t now) {
    if (active_ && static_cast<uint32_t>(now - since_) >= 2000) active_ = false;
  }
 private:
  bool active_ = false;
  uint32_t highWater_ = 0, token_ = 0, since_ = 0;
};
