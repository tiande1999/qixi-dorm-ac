"""Upload all files in this directory to /usr; run main.start() from QPYcom."""
import board_config as cfg
from controller import Controller
from inputs import Ring, Debouncer, Buttons
from link import Link
from protocol import Decoder, encode
from timebase import diff
from ui import UI


def start():
    cfg.validate()  # before constructing ANY peripheral
    from machine import Pin, ExtInt, UART, WDT
    import utime
    import urandom
    boot = "%08x" % urandom.getrandbits(32)
    controller = Controller(cfg.DELAY_MS)
    link = Link(boot, controller)
    ui = UI(controller, link)
    ring = Ring(cfg.QUEUE_SIZE)
    decoder = Decoder()
    pins = {name: Pin(getattr(Pin, pad), Pin.IN, Pin.PULL_PU)
            for name, pad in cfg.PINS.items()}
    uart = UART(getattr(UART, cfg.UART_NAME), 9600, 8, 0, 1, 0)
    interrupts = []

    def active(name):
        return pins[name].read() == cfg.ACTIVE_LEVEL[name]

    def snapshot():
        return (int(active("a")) * 2 + int(active("b")),
                active("door"), active("arm"))

    def callback_for(name):
        def callback(args):
            ring.push((name, active(name), utime.ticks_ms()))
        return callback

    for name in ("a", "b", "door", "arm"):
        irq = ExtInt(getattr(ExtInt, cfg.PINS[name]),
                     ExtInt.IRQ_RISING_FALLING, ExtInt.PULL_PU,
                     callback_for(name), filter_time=0)
        irq.enable()
        interrupts.append(irq)

    now = utime.ticks_ms()
    mask, door, arm = snapshot()
    sensor = Debouncer(mask, now, cfg.DEBOUNCE_MS)
    controller.raw_inputs(mask, door, arm, now)
    controller.sensor(mask, now)
    key_debounce = {k: Debouncer(active(k), now, cfg.BUTTON_DEBOUNCE_MS)
                    for k in ("plus", "minus", "confirm")}
    buttons = Buttons()
    watchdog = WDT(period=cfg.WDT_PERIOD_MS)
    last_display = now
    last_loop = now
    log_seq = 0

    def accept_debounce(value, timestamp):
        if value is not None:
            controller.sensor(value, timestamp)

    def resample(timestamp):
        current_mask, current_door, current_arm = snapshot()
        controller.raw_inputs(current_mask, current_door, current_arm, timestamp)
        accept_debounce(sensor.feed(current_mask, timestamp), timestamp)
        return current_mask, current_door, current_arm

    try:
        while True:
            now = utime.ticks_ms()
            if diff(now, last_loop) > cfg.MAX_EVENT_AGE_MS:
                controller.fault("main_loop_late", now)
            last_loop = now
            if ring.overflow:
                controller.fault("irq_queue_overflow", now)
                ring.overflow = False
            item = ring.pop()
            while item is not None:
                name, value, timestamp = item
                if diff(now, timestamp) > cfg.MAX_EVENT_AGE_MS:
                    controller.fault("stale_sensor_event", now)
                if name == "a":
                    mask = (mask | 2) if value else (mask & 1)
                elif name == "b":
                    mask = (mask | 1) if value else (mask & 2)
                elif name == "door":
                    door = value
                else:
                    arm = value
                controller.raw_inputs(mask, door, arm, timestamp)
                accept_debounce(sensor.feed(mask, timestamp), timestamp)
                item = ring.pop()
            mask, door, arm = resample(now)
            accept_debounce(sensor.advance(now), now)
            pressed = set()
            for name, deb in key_debounce.items():
                deb.feed(active(name), now)
                deb.advance(now)
                if deb.value:
                    pressed.add(name)
            for event in buttons.update(pressed, now):
                ui.handle(event, now)
            controller.tick(now)
            available = uart.any()
            if available:
                for message in decoder.feed(uart.read(min(available, 768)) or b""):
                    link.receive(message, now)
            ui.update(now)
            link.update(now)
            if diff(now, last_display) >= 1000:
                link.display(ui.lines(now))
                last_display = now
            # Fresh sample after processing UART/UI, just before granting output.
            mask, door, arm = resample(utime.ticks_ms())
            for message in link.take_output(utime.ticks_ms()):
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
