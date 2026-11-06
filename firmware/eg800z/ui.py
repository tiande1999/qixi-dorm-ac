"""Physical-button UI. English OLED labels are explained in the Chinese guide."""
class UI:
    def __init__(self, controller, link):
        self.ctrl = controller
        self.link = link
        self.value = 0
        self.notice = "Hold OK: calibrate"
        self.frequency = 38

    def handle(self, event, now):
        mode = self.ctrl.ui_mode
        if event == "pair_long":
            if self.link.learn("start", now):
                self.notice = "Send OFF twice"
            else:
                self.notice = "ESP not connected"
            return
        if event == "confirm_long":
            if mode == "LEARN":
                self.link.learn("abort", now)
            self.ctrl.set_ui_mode("CALIBRATE", now)
            self.value = self.ctrl.count if self.ctrl.count is not None else 0
            self.notice = "Set ACTUAL count"
            return
        if mode == "CALIBRATE":
            if event == "plus":
                self.value = min(99, self.value + 1)
            elif event == "minus":
                self.value = max(0, self.value - 1)
            elif event == "confirm":
                if self.ctrl.calibrate(self.value, now):
                    self.ctrl.set_ui_mode("RUN", now)
                    self.notice = "Count calibrated"
                else:
                    self.notice = "Clear A/B then wait"
        elif mode == "LEARN":
            if event == "plus":
                self.link.learn("test", now)
            elif event == "minus":
                self.frequency = {36: 38, 38: 40, 40: 36}[self.frequency]
                self.link.learn("frequency", now, khz=self.frequency)
            elif event == "confirm":
                self.link.learn("confirm", now)
        elif event == "confirm":
            self.notice = "Hold OK: calibrate"

    def update(self, now):
        if self.ctrl.ui_mode == "LEARN" and self.link.learn_stage == "VERIFIED":
            self.ctrl.set_ui_mode("CALIBRATE", now)
            self.value = 0
            self.notice = "Set ACTUAL count"

    def lines(self, now):
        s = self.ctrl.status(now)
        if s["mode"] == "CALIBRATE":
            return ["CALIBRATE", "Actual count: %d" % self.value,
                    "+/- adjust", "OK save", self.notice]
        if s["mode"] == "LEARN":
            return ["LEARN OFF ONLY", self.link.learn_stage,
                    "+ test / OK attest", "- carrier %dkHz" % self.frequency,
                    "Hold OK: abort", self.link.remote_error or self.notice]
        return ["DORM AC / LOCAL", "Count: %s %s" % (s["count"] if s["count"] is not None else "?", "OK" if s["trusted"] else "CHECK"),
                "Door: " + ("closed" if s["door"] else "open"),
                "ARMED" if s["armed"] else "PAUSED (switch)",
                ("OFF in %ds" % s["remaining"]) if s["remaining"] is not None else ("ESP ready" if self.ctrl.link_ready else "ESP/unpaired"),
                s["result"] if s["result"] != "none" else self.notice]
