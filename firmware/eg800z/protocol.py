"""Wire v1: ASCII compact JSON + '*' + CRC16/CCITT-FALSE hex + LF."""
try:
    import ujson as json
except ImportError:
    import json

MAX_FRAME = 384


def crc16(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def encode(message):
    body = json.dumps(message).encode("ascii")
    frame = body + ("*%04X\n" % crc16(body)).encode("ascii")
    if len(frame) > MAX_FRAME:
        raise ValueError("frame_too_large")
    return frame


def decode(frame):
    if len(frame) > MAX_FRAME or not frame.endswith(b"\n"):
        raise ValueError("bad_frame_length")
    line = frame[:-1]
    if len(line) < 7 or line[-5:-4] != b"*":
        raise ValueError("bad_frame_format")
    body = line[:-5]
    if any(x < 32 or x > 126 for x in body):
        raise ValueError("non_ascii_frame")
    if crc16(body) != int(line[-4:].decode("ascii"), 16):
        raise ValueError("bad_crc")
    message = json.loads(body.decode("ascii"))
    if not isinstance(message, dict) or type(message.get("v")) is not int or message["v"] != 1:
        raise ValueError("bad_version")
    if not isinstance(message.get("t"), str) or len(message["t"]) != 1:
        raise ValueError("bad_type")
    return message


class Decoder:
    def __init__(self):
        self.buffer = bytearray()
        self.dropping = False
        self.errors = 0

    def feed(self, chunk):
        messages = []
        for byte in chunk:
            if self.dropping:
                if byte == 10:
                    self.dropping = False
                continue
            self.buffer.append(byte)
            if len(self.buffer) > MAX_FRAME:
                self.buffer = bytearray()
                self.dropping = byte != 10
                self.errors += 1
            elif byte == 10:
                try:
                    messages.append(decode(bytes(self.buffer)))
                except (ValueError, TypeError, UnicodeError):
                    self.errors += 1
                self.buffer = bytearray()
        return messages
