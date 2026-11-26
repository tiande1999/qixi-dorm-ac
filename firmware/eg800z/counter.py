"""Complete passage recognition for normalized HC-SR04 (2) and KY-032 (1)."""
from timebase import diff


class Counter:
    PATHS = ((2, 3, 1, 0), (2, 0, 1, 0),
             (1, 3, 2, 0), (1, 0, 2, 0))

    def __init__(self, timeout_ms=3500, outer_sensor=2):
        if outer_sensor not in (1, 2) or timeout_ms <= 0:
            raise ValueError("invalid doorway calibration")
        self.outer_sensor = outer_sensor
        self.timeout_ms = timeout_ms
        self.mask = 0
        self.path = ()
        self.started = None
        self.blocked = False

    def idle(self):
        return not self.path and not self.blocked and self.mask == 0

    def reset(self):
        if self.mask != 0:
            return False
        self.path = ()
        self.started = None
        self.blocked = False
        return True

    def _fault(self, reason):
        self.path = ()
        self.started = None
        self.blocked = self.mask != 0
        return {"fault": reason}

    def tick(self, now):
        if self.started is not None and diff(now, self.started) >= self.timeout_ms:
            return self._fault("passage_timeout")
        return None

    def feed(self, mask, now):
        if mask not in (0, 1, 2, 3):
            return self._fault("invalid_sensor_mask")
        late = self.tick(now)
        if mask == self.mask:
            return late
        self.mask = mask
        if late:
            self.blocked = mask != 0
            return late
        if self.blocked:
            if mask == 0:
                self.blocked = False
            return None
        if not self.path:
            if mask == 0:
                return None
            self.started = now
        self.path += (mask,)
        if self.path in self.PATHS:
            direction = 1 if self.path[0] == self.outer_sensor else -1
            self.path = ()
            self.started = None
            return {"delta": direction}
        if not any(p[:len(self.path)] == self.path for p in self.PATHS):
            return self._fault("ambiguous_passage")
        return None
