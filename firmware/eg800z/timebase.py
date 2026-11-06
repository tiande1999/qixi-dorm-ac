"""QuecPython-compatible, wrap-safe millisecond arithmetic (2**30 period)."""
PERIOD = 1 << 30


def diff(now, then):
    return ((now - then + PERIOD // 2) % PERIOD) - PERIOD // 2


def add(now, duration):
    return (now + duration) % PERIOD
