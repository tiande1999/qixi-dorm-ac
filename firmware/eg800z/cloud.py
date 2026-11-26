"""Feiyuan transport boundary. Identity and trusted UTC come from a verified adapter."""
from controller import SIM_AUTO


def snapshot(controller, now):
    state = controller.status(now)
    return {
        "person_count": state["count"], "count_status": state["count_status"],
        "door_status": "CLOSED" if state["door"] else "OPEN",
        "device_mode": state["device_mode"], "state_version": state["version"],
        "countdown_seconds": state["remaining"], "network_status": state["network_status"],
        "sim_ac_state": "UNKNOWN", "last_error": state["reason"],
        "application_version": state["application_version"],
        "application_status": state["application_status"], "last_result": state["result"],
    }


class CloudGateway:
    def __init__(self, transport, authenticate, boot_session):
        self.transport = transport
        self.authenticate = authenticate
        self.boot = boot_session
        self.seen = {}

    def handle(self, request, controller, now, utc, online):
        if not isinstance(request, dict):
            return {"ok": False, "reason": "invalid_request"}
        request_id = request.get("request_id")
        result = self._handle(request, controller, now, utc, online)
        self.transport.reply({"request_id": request_id if isinstance(request_id, str) else None,
                              "ok": result == "accepted", "reason": result,
                              "state": snapshot(controller, now) if result == "accepted" else None})
        return result

    def _handle(self, request, controller, now, utc, online):
        if online is not True or type(utc) is not int:
            return "context_unverified"
        # The verifier must authenticate the exact request fields and membership.
        # Ordinary App product-property writes do not carry this guarantee.
        member_id = request.get("member_id")
        if (not isinstance(member_id, str) or not 1 <= len(member_id) <= 64
                or self.authenticate(request) is not True):
            return "unauthenticated"
        expires = request.get("expires_utc")
        request_id = request.get("request_id")
        nonce = request.get("nonce")
        version = request.get("state_version")
        if (type(expires) is not int or not 0 < expires - utc <= 60
                or request.get("boot_session") != self.boot
                or type(version) is not int or version != controller.version
                or not isinstance(request_id, str) or not 1 <= len(request_id) <= 64
                or not isinstance(nonce, str) or not 1 <= len(nonce) <= 64):
            return "stale_or_invalid"
        for key in tuple(self.seen):
            if self.seen[key] <= utc:
                del self.seen[key]
        keys = (("id", request_id), ("nonce", nonce))
        if any(key in self.seen for key in keys):
            return "replay"
        if len(self.seen) >= 128:
            return "request_limit"
        for key in keys:
            self.seen[key] = expires
        action = request.get("action")
        if action == "query":
            return "accepted"
        if action == "calibrate":
            ok = controller.calibrate(request.get("person_count"), now)
        elif action == "confirm" and request.get("room_checked") is not True:
            return "room_check_required"
        elif action in ("confirm", "veto"):
            ok = controller.member_decision(action, version, now)
        elif action == "pause" or (action == "simulation_pause" and controller.mode == SIM_AUTO):
            controller.set_ui_mode("PAUSED", now)
            ok = True
        elif action == "simulation_resume" and controller.mode == SIM_AUTO and controller.ui_mode == "PAUSED":
            controller.set_ui_mode("RUN", now)
            ok = True
        else:
            return "unsupported_action"
        controller.log("cloud_request", now, action=action, request_id=request_id, member_id=member_id, accepted=ok)
        return "accepted" if ok else "local_state_rejected"

    def publish(self, controller, now):
        data = snapshot(controller, now)
        data["boot_session"] = self.boot
        self.transport.publish(data)


class MockTransport:
    def __init__(self):
        self.reports = []
        self.replies = []
        self.inbox = []
        self.current_context = (False, None, None)

    def context(self):
        return self.current_context

    def receive(self):
        return self.inbox.pop(0) if self.inbox else None

    def publish(self, data):
        self.reports.append(data)

    def reply(self, data):
        self.replies.append(data)


class CloudRuntime:
    """SDK adapter exposes context(), receive(), reply() and publish()."""
    def __init__(self, adapter, authenticate):
        self.adapter = adapter
        self.authenticate = authenticate
        self.gateway = None
        self.previous = None

    def poll(self, controller, boot, now):
        if self.gateway is None:
            self.gateway = CloudGateway(self.adapter, self.authenticate, boot)
        online, utc, local_time = self.adapter.context()
        controller.set_context(online, local_time if type(utc) is int else None, now)
        if online is True:
            request = self.adapter.receive()
            if request is not None:
                self.gateway.handle(request, controller, now, utc, online)
            data = snapshot(controller, now)
            if data != self.previous:
                self.gateway.publish(controller, now)
                self.previous = data
        else:
            self.previous = None
