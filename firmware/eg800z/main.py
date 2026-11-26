"""Upload all files in this directory to /usr; run main.start() from QPYcom."""
import board_config as cfg
from controller import Controller
from inputs import Ring, Debouncer, Buttons, Ultrasonic
from link import Link
from protocol import Decoder, encode
from timebase import diff
from ui import UI


def start(echo_reader=None, cloud_runtime=None):
    """echo_reader(trigger, echo, timeout_us) returns pulse width or None.
    The board-specific callback must be measured and bounded before use.
    cloud_runtime.poll(controller, boot, now) must also be nonblocking.
    """
    cfg.validate()  # before constructing ANY peripheral
    if not callable(echo_reader):
        raise RuntimeError("Supply a board-verified HC-SR04 pulse reader")
    from machine import Pin, ExtInt, UART, WDT
    import utime
    import urandom
    boot = "%08x" % urandom.getrandbits(32)
    controller = Controller(cfg.DELAY_MS, mode=cfg.CONTROL_MODE,
                            isolated=cfg.SIM_ISOLATION_VERIFIED,
                            passage_ms=cfg.PASSAGE_TIMEOUT_MS, outer_sensor=cfg.OUTER_SENSOR)
    controller.sensor_healthy = False
    ultrasound = Ultrasonic(cfg.ULTRASONIC_ENTER_MM, cfg.ULTRASONIC_RELEASE_MM,
                            cfg.ULTRASONIC_PERIOD_MS, cfg.ULTRASONIC_STALE_MS)
    link = Link(boot, controller)
    ui = UI(controller, link)
    ring = Ring(cfg.QUEUE_SIZE)
    decoder = Decoder()
    pins = {name: Pin(getattr(Pin, pad), Pin.IN, Pin.PULL_PU)
            for name, pad in cfg.PINS.items() if name not in ("trigger", "echo")}
    trigger = Pin(getattr(Pin, cfg.PINS["trigger"]), Pin.OUT, Pin.PULL_DISABLE, 0)
    echo = Pin(getattr(Pin, cfg.PINS["echo"]), Pin.IN, Pin.PULL_DISABLE)
    uart = UART(getattr(UART, cfg.UART_NAME), 9600, 8, 0, 1, 0)
    interrupts = []

    def active(name):
        return pins[name].read() == cfg.ACTIVE_LEVEL[name]

    def snapshot():
        return (int(ultrasound.active) * 2 + int(active("ky")),
                active("door"), active("arm"))

    def callback_for(name):
        def callback(args):
            ring.push((name, active(name), utime.ticks_ms()))
        return callback

    for name in ("ky", "door", "arm"):
        irq = ExtInt(getattr(ExtInt, cfg.PINS[name]),
                     ExtInt.IRQ_RISING_FALLING, ExtInt.PULL_PU,
                     callback_for(name), filter_time=0)
        irq.enable()
        interrupts.append(irq)

    now = utime.ticks_ms()
    mask, door, arm = snapshot()
    ky = Debouncer(bool(mask & 1), now, cfg.KY_DEBOUNCE_MS)
    controller.raw_inputs(mask, door, arm, now)
    controller.sensor(mask, now)
    key_debounce = {k: Debouncer(active(k), now, cfg.BUTTON_DEBOUNCE_MS)
                    for k in ("plus", "minus", "confirm")}
    buttons = Buttons()
    watchdog = WDT(period=cfg.WDT_PERIOD_MS)
    last_display = now
    last_loop = now
    log_seq = 0

    def sample_ky(value, timestamp):
        ky.feed(value, timestamp)
        ky.advance(timestamp)
        controller.sensor(2 * int(ultrasound.active) + int(ky.value), timestamp)

    def drain(now):
        nonlocal mask, door, arm
        if ring.overflow:
            controller.fault("irq_queue_overflow", now)
            ring.overflow = False
        item = ring.pop()
        while item is not None:
            name, value, timestamp = item
            if diff(now, timestamp) > cfg.MAX_EVENT_AGE_MS:
                controller.fault("stale_sensor_event", now)
            if name == "ky":
                print({"ms": timestamp, "ky_active": value})
                mask = (mask | 1) if value else (mask & 2)
            elif name == "door":
                door = value
            else:
                arm = value
            controller.raw_inputs(mask, door, arm, timestamp)
            sample_ky(bool(mask & 1), timestamp)
            item = ring.pop()

    def resample(timestamp):
        current_mask, current_door, current_arm = snapshot()
        controller.raw_inputs(current_mask, current_door, current_arm, timestamp)
        sample_ky(bool(current_mask & 1), timestamp)
        return current_mask, current_door, current_arm

    try:
        while True:
            now = utime.ticks_ms()
            if diff(now, last_loop) > cfg.MAX_EVENT_AGE_MS:
                controller.fault("main_loop_late", now)
            last_loop = now
            drain(now)
            mask, door, arm = resample(now)
            if ultrasound.due(now):
                try:
                    width = echo_reader(trigger, echo, cfg.ULTRASONIC_ECHO_TIMEOUT_US)
                except Exception:
                    width = None
                now = utime.ticks_ms()
                drain(now)
                sample = ultrasound.sample(width, now)
                print(sample)
                if not sample["valid"]:
                    controller.fault("ultrasonic_echo_invalid", now)
                mask, door, arm = resample(now)
            healthy_echo = ultrasound.healthy(now)
            controller.sensor_healthy = healthy_echo
            if not healthy_echo and controller.reason != "ultrasonic_echo_stale" and (ultrasound.valid or controller.trusted):
                controller.fault("ultrasonic_echo_stale", now)
            pressed = set()
            for name, deb in key_debounce.items():
                deb.feed(active(name), now)
                deb.advance(now)
                if deb.value:
                    pressed.add(name)
            for event in buttons.update(pressed, now):
                if healthy_echo:
                    ui.handle(event, now)
            controller.tick(now)
            available = uart.any()
            if available:
                for message in decoder.feed(uart.read(min(available, 768)) or b""):
                    link.receive(message, now)
            ui.update(now)
            if cloud_runtime is not None:
                cloud_runtime.poll(controller, boot, now)
            link.update(now)
            if diff(now, last_display) >= 1000:
                lines = ui.lines(now)
                link.display(lines)
                print({"ms": now, "local_ui": lines})
                last_display = now
            # Fresh sample after processing UART/UI, just before granting output.
            now = utime.ticks_ms()
            drain(now)
            mask, door, arm = resample(now)
            if not ultrasound.healthy(now) or ring.overflow or ring.head != ring.tail:
                link.cancel()
            for message in link.take_output(now):
                frame = encode(message)
                written = uart.write(frame)
                if written != len(frame):
                    controller.fault("uart_short_write", utime.ticks_ms())
                    controller.set_link(False, "", utime.ticks_ms())
            for event in controller.events:
                if event["seq"] > log_seq:
                    print(event)
                    log_seq = event["seq"]
            watchdog.feed()
            utime.sleep_ms(5)
    finally:
        # ESP's token expires independently. A crash never leaves an indefinite
        # permission; its heartbeat watchdog also abandons the host session.
        for irq in interrupts:
            irq.disable()
        uart.close()


if __name__ == "__main__":
    start()
