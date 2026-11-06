"""Bounded IRQ queue and time-based (not loop-count-based) debounce."""
from timebase import diff


class Ring:
    def __init__(self, size=128):
        self.items = [None] * (size + 1)
        self.head = 0
        self.tail = 0
        self.overflow = False

    def push(self, item):
        nxt = (self.head + 1) % len(self.items)
        if nxt == self.tail:
            self.overflow = True
            return False
        self.items[self.head] = item
        self.head = nxt
        return True

    def pop(self):
        if self.head == self.tail:
            return None
        item = self.items[self.tail]
        self.tail = (self.tail + 1) % len(self.items)
        return item


class Debouncer:
    def __init__(self, value, now, stable_ms=10):
        self.raw = value
        self.value = value
        self.since = now
        self.stable_ms = stable_ms

    def advance(self, now):
        if self.raw != self.value and diff(now, self.since) >= self.stable_ms:
            self.value = self.raw
            return self.value
        return None

    def feed(self, value, now):
        changed = self.advance(now)
        if value != self.raw:
            self.raw = value
            self.since = now
        return changed


class Buttons:
    def __init__(self):
        self.down = {}
        self.long_sent = set()
        self.combo_since = None
        self.combo_sent = False

    def update(self, pressed, now):
        events = []
        combo = "plus" in pressed and "minus" in pressed
        if combo:
            if self.combo_since is None:
                self.combo_since = now
            if not self.combo_sent and diff(now, self.combo_since) >= 2000:
                events.append("pair_long")
                self.combo_sent = True
                self.long_sent.update(("plus", "minus"))
        else:
            self.combo_since = None
            if not ("plus" in pressed or "minus" in pressed):
                self.combo_sent = False
        for key in ("plus", "minus", "confirm"):
            if key in pressed:
                if key not in self.down:
                    self.down[key] = now
                if key == "confirm" and key not in self.long_sent and diff(now, self.down[key]) >= 2000:
                    events.append("confirm_long")
                    self.long_sent.add(key)
            elif key in self.down:
                if key not in self.long_sent and not self.combo_sent:
                    events.append(key)
                del self.down[key]
                self.long_sent.discard(key)
        return events
