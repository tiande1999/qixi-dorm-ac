"""Short-lived two-phase OFF permission. No automatic retransmission of COMMIT."""
from timebase import diff


class Link:
    def __init__(self, boot_id, controller):
        self.boot = boot_id
        self.esp = ""
        self.ctrl = controller
        self.q = 0
        self.last_hello = None
        self.last_reply = None
        self.last_q = -1
        self.command = 0
        self.manual_seq = 0
        self.pending = None
        self.sent_id = None
        self.out = []
        self.verified = False
        self.profile = ""
        self.sim_ready = False
        self.learn_stage = "IDLE"
        self.remote_error = ""

    def message(self, kind, **fields):
        result = {"v": 1, "t": kind, "e": self.boot, "s": self.esp}
        result.update(fields)
        return result

    def healthy(self, now):
        return self.last_reply is not None and diff(now, self.last_reply) < 3000

    def update(self, now):
        if self.last_hello is None or diff(now, self.last_hello) >= 1000:
            self.q += 1
            self.out.append(self.message("h", q=self.q))
            self.last_hello = now
        self.ctrl.set_executor_online(self.healthy(now))
        self.ctrl.set_link(self.healthy(now) and self.sim_ready,
                           "SIM-V1" if self.sim_ready else "", now)
        if self.pending:
            if not self.ctrl.can_commit(self.pending["version"], now):
                self.cancel()
            elif diff(now, self.pending["since"]) >= 1500:
                self.ctrl.failed_attempt("prepare_timeout", now)
                self.cancel()
        if not self.pending:
            version = self.ctrl.prepare(now)
            if version is not None:
                self.command += 1
                self.pending = {"id": self.command, "version": version, "since": now}
                self.out.append(self.message("P", id=self.command, sv=version, mode="SIM_AUTO", action="SIM_OFF"))

    def cancel(self):
        if self.pending:
            self.out.append(self.message("X", id=self.pending["id"]))
        self.pending = None

    def receive(self, msg, now):
        if msg.get("e") != self.boot:
            return
        kind = msg.get("t")
        if kind == "H":
            q = msg.get("q")
            if type(q) is not int or q != self.q or q == self.last_q:
                return
            if self.last_hello is None or diff(now, self.last_hello) >= 1000:
                return
            esp = msg.get("s")
            profile = msg.get("p", "")
            if not isinstance(esp, str) or len(esp) != 8 or not isinstance(profile, str):
                return
            if esp != self.esp:
                self.pending = None
                self.sent_id = None
                self.ctrl.set_executor_online(False)
                self.ctrl.set_link(False, "", now)
            self.esp = esp
            self.last_q = q
            self.last_reply = now
            self.ctrl.set_executor_online(True)
            self.verified = msg.get("ok") is True
            self.profile = profile
            self.learn_stage = str(msg.get("stage", "IDLE"))[:20]
            self.remote_error = str(msg.get("err", ""))[:32]
            self.sim_ready = msg.get("sim") is True
            self.ctrl.set_link(self.sim_ready, "SIM-V1" if self.sim_ready else "", now)
        elif msg.get("s") != self.esp or not self.healthy(now):
            return
        elif kind == "R":
            if not self.pending or msg.get("id") != self.pending["id"] or msg.get("sv") != self.pending["version"]:
                return
            token = msg.get("k")
            if not isinstance(token, str) or len(token) != 8:
                return
            if (diff(now, self.pending["since"]) < 1500
                    and self.ctrl.can_commit(self.pending["version"], now)):
                self.out.append(self.message("C", id=self.pending["id"],
                                             sv=self.pending["version"], mode="SIM_AUTO", action="SIM_OFF", k=token))
        elif kind == "A" and msg.get("id") == self.sent_id:
            if msg.get("result") == "ir_tx_finished":
                self.ctrl.result = "ir_tx_finished"
                self.ctrl.log("ir_tx_finished", now)
        elif kind == "E":
            self.remote_error = str(msg.get("err", "executor_error"))[:32]
            if self.pending and msg.get("id") == self.pending["id"]:
                self.ctrl.failed_attempt(self.remote_error, now)
                self.cancel()

    def take_output(self, now):
        """Call only after a final hardware sample. Returns frames to write once."""
        output, self.out = self.out, []
        # Never place slow display/heartbeat writes between final input sampling
        # and a validated COMMIT.
        output.sort(key=lambda m: 0 if m["t"] == "C" else 1)
        approved = []
        for msg in output:
            if msg["t"] == "C":
                if (not self.pending or msg.get("id") != self.pending["id"]
                        or msg.get("sv") != self.pending["version"]
                        or not self.ctrl.can_commit(self.pending["version"], now)):
                    self.cancel()
                    continue
                if diff(now, self.pending["since"]) >= 1500:
                    self.ctrl.failed_attempt("commit_expired", now)
                    self.cancel()
                    continue
                self.sent_id = self.pending["id"]
                self.pending = None
                self.ctrl.dispatched(now)
            approved.append(msg)
        return approved

    def learn(self, action, now, **fields):
        if action == "test" or not self.healthy(now):
            return False
        self.cancel()
        self.ctrl.set_ui_mode("LEARN", now)
        self.manual_seq += 1
        self.out.append(self.message("L", op=self.manual_seq, action=action, **fields))
        return True

    def display(self, lines):
        if self.esp:
            self.out.append(self.message("S", lines=[s[:21] for s in lines[:6]]))
