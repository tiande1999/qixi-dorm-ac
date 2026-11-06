"""Hardware-independent local authority; there is deliberately no network input."""
from counter import Counter
from timebase import diff


class Controller:
    def __init__(self, delay_ms=900000, door_stable_ms=2000):
        if delay_ms < 900000:
            raise ValueError("Real controller delay must be at least 900000 ms")
        self.delay_ms = delay_ms
        self.door_stable_ms = door_stable_ms
        self.counter = Counter()
        self.count = None
        self.trusted = False
        self.reason = "boot_unknown"
        self.raw_mask = 0
        self.door_closed = False
        self.closed_since = None
        self.armed = False
        self.ui_mode = "RUN"
        self.link_ready = False
        self.profile_id = ""
        self.version = 0
        self.event_seq = 0
        self.empty_since = None
        self.pending_version = None
        self.episode_done = False
        self.result = "none"
        self.events = []

    def log(self, event, now, **fields):
        self.event_seq += 1
        item = {"seq": self.event_seq, "ms": now, "event": event,
                "count": self.count, "trusted": self.trusted}
        item.update(fields)
        self.events.append(item)
        if len(self.events) > 64:
            self.events.pop(0)

    def invalidate(self):
        self.version += 1
        self.empty_since = None
        self.pending_version = None

    def fault(self, reason, now):
        self.invalidate()
        self.trusted = False
        self.reason = reason
        self.log("fault", now, reason=reason)

    def raw_inputs(self, mask, door_closed, armed, now):
        # Called before debounce and before any COMMIT. Even a short new pulse
        # cancels an outstanding countdown/permission.
        if mask != self.raw_mask:
            self.raw_mask = mask
            self.invalidate()
        if door_closed != self.door_closed:
            self.door_closed = door_closed
            self.closed_since = now if door_closed else None
            self.invalidate()
        if armed != self.armed:
            self.armed = armed
            self.invalidate()
            self.log("arm_changed", now, armed=armed)

    def sensor(self, mask, now):
        event = self.counter.feed(mask, now)
        if event:
            self._counter_event(event, now)

    def _counter_event(self, event, now):
        self.invalidate()
        if "fault" in event:
            self.fault(event["fault"], now)
            return
        delta = event["delta"]
        if self.count is not None:
            if self.count + delta < 0:
                self.fault("count_underflow", now)
                return
            if self.count + delta > 99:
                self.fault("count_overflow", now)
                return
            self.count += delta
            if self.count > 0:
                self.episode_done = False
                self.result = "none"
        self.log("enter" if delta > 0 else "leave", now)

    def calibrate(self, number, now):
        if type(number) is not int or not 0 <= number <= 99:
            return False
        if self.raw_mask or not self.counter.idle():
            return False
        self.count = number
        self.trusted = True
        self.reason = ""
        self.episode_done = False
        self.result = "none"
        self.invalidate()
        self.log("calibrated", now)
        return True

    def set_ui_mode(self, mode, now):
        if mode != self.ui_mode:
            self.ui_mode = mode
            self.invalidate()
            if mode == "LEARN":
                self.trusted = False
                self.reason = "recalibrate_after_learning"
            self.log("ui_mode", now, mode=mode)

    def set_link(self, ready, profile_id, now):
        if (ready, profile_id) != (self.link_ready, self.profile_id):
            self.link_ready = ready
            self.profile_id = profile_id
            self.invalidate()
            self.log("link", now, ready=ready, profile=profile_id)

    def eligible(self, now):
        return (self.count == 0 and self.trusted and self.counter.idle()
                and self.raw_mask == 0 and self.door_closed
                and self.closed_since is not None
                and diff(now, self.closed_since) >= self.door_stable_ms
                and self.armed and self.ui_mode == "RUN"
                and self.link_ready and bool(self.profile_id)
                and not self.episode_done)

    def tick(self, now):
        event = self.counter.tick(now)
        if event:
            self._counter_event(event, now)
        if not self.eligible(now):
            self.empty_since = None
            self.pending_version = None
            return False
        if self.empty_since is None:
            self.empty_since = now
        return diff(now, self.empty_since) >= self.delay_ms

    def prepare(self, now):
        if not self.tick(now) or self.pending_version is not None:
            return None
        self.pending_version = self.version
        self.log("off_prepare", now)
        return self.version

    def can_commit(self, version, now):
        return (self.pending_version == version == self.version
                and self.eligible(now) and self.empty_since is not None
                and diff(now, self.empty_since) >= self.delay_ms)

    def dispatched(self, now):
        self.episode_done = True
        self.result = "result_unknown"
        self.pending_version = None
        self.log("off_dispatched", now)

    def failed_attempt(self, reason, now):
        self.episode_done = True
        self.result = reason
        self.invalidate()
        self.log("off_failed", now, reason=reason)

    def status(self, now):
        remaining = None
        if self.empty_since is not None and not self.episode_done:
            remaining = max(0, (self.delay_ms - diff(now, self.empty_since) + 999) // 1000)
        return {"count": self.count, "trusted": self.trusted,
                "reason": self.reason, "door": self.door_closed,
                "armed": self.armed, "mode": self.ui_mode,
                "remaining": remaining, "version": self.version,
                "result": self.result, "ac_actual_state": "unknown"}
