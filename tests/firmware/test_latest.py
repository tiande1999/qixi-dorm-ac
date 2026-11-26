import pathlib
import sys
import unittest
from datetime import datetime

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "firmware" / "eg800z"))
from cloud import CloudGateway, CloudRuntime, MockTransport
from controller import Controller, REMIND_ONLY, SIM_AUTO, in_work_window
from inputs import Debouncer, Ultrasonic, make_echo_reader


MONDAY = datetime(2026, 11, 23, 8).timetuple()


def empty(mode="REAL_CONFIRM", isolated=False):
    c = Controller(mode=mode, isolated=isolated)
    c.raw_inputs(0, True, True, 0)
    c.set_link(True, "SIM-V1", 0)
    c.set_executor_online(True)
    c.set_context(True, MONDAY, 0)
    assert c.calibrate(0, 0)
    c.tick(2000)
    return c


class LatestTests(unittest.TestCase):
    def test_work_window_boundaries(self):
        for day, hour, expected in ((23, 7, False), (23, 8, True), (27, 17, True),
                                    (27, 18, False), (28, 9, False)):
            self.assertEqual(in_work_window(datetime(2026, 11, day, hour).timetuple()), expected)
        self.assertFalse(in_work_window(None))

    def test_real_waits_and_does_not_emit_even_after_mock_confirmation(self):
        c = empty()
        self.assertIsNone(c.prepare(901999))
        self.assertIsNone(c.application)
        self.assertIsNone(c.prepare(902000))
        self.assertEqual(c.application, 902000)
        self.assertTrue(c.member_decision("confirm", c.version, 902001))
        self.assertFalse(c.member_decision("confirm", c.version, 902002))
        self.assertIsNone(c.prepare(902003))

    def test_veto_and_disconnect_invalidate_member_approval(self):
        for veto in (True, False):
            c = empty()
            c.tick(902000)
            version = c.version
            self.assertTrue(c.member_decision("confirm", version, 902001))
            if veto:
                self.assertTrue(c.member_decision("veto", version, 902002))
            else:
                c.set_context(False, None, 902002)
                c.set_context(True, MONDAY, 902003)
            self.assertIsNone(c.confirmed_at)
            self.assertFalse(c.member_decision("confirm", version, 902004))
            self.assertIsNone(c.prepare(902004))

    def test_expired_application_is_not_reopened(self):
        c = empty()
        c.tick(902000)
        self.assertFalse(c.tick(962000))
        self.assertIsNone(c.application)
        self.assertFalse(c.tick(962001))

    def test_reminder_and_unisolated_sim_never_prepare(self):
        for mode in (REMIND_ONLY, SIM_AUTO):
            self.assertIsNone(empty(mode).prepare(902000))

    def test_ultrasonic_timeout_hysteresis_and_staleness(self):
        u = Ultrasonic(550, 650, 70, 250)
        self.assertTrue(u.due(0))
        self.assertEqual(u.sample(None, 0)["distance_mm"], None)
        self.assertFalse(u.healthy(0))
        self.assertFalse(u.due(69))
        self.assertTrue(u.sample(3000, 70)["active"])
        self.assertTrue(u.sample(3500, 140)["active"])
        self.assertFalse(u.sample(4000, 210)["active"])
        self.assertFalse(u.healthy(460))

    def test_heterogeneous_passage_and_ky_glitch(self):
        c = empty()
        u = Ultrasonic(550, 650, 70, 250)
        ky = Debouncer(False, 2000, 20)
        for now, echo, raw_ky in [(2100, 3000, False), (2110, None, True),
                                  (2115, None, False), (2170, 3000, True),
                                  (2190, None, True), (2240, 4000, True),
                                  (2250, None, False), (2270, None, False)]:
            if echo is not None:
                u.sample(echo, now)
            ky.feed(raw_ky, now)
            ky.advance(now)
            c.raw_inputs(2 * int(u.active) + int(raw_ky), True, True, now)
            c.sensor(2 * int(u.active) + int(ky.value), now)
        self.assertEqual(c.count, 1)
        self.assertTrue(c.trusted)

    def test_mock_rejects_bad_identity_replay_and_old_boot(self):
        c = empty()
        transport = MockTransport()
        gateway = CloudGateway(transport, lambda msg: msg.get("proof") == "mock-member", "boot")
        request = dict(action="calibrate", member_id="mock-member", person_count=2, request_id="001", nonce="abc",
                       boot_session="boot", state_version=c.version, expires_utc=110)
        self.assertEqual(gateway.handle(request, c, 2100, 100, True), "unauthenticated")
        self.assertEqual(c.count, 0)
        request["proof"] = "mock-member"
        self.assertEqual(gateway.handle(dict(request, boot_session="old"), c, 2100, 100, True), "stale_or_invalid")
        self.assertEqual(gateway.handle(request, c, 2100, 110, True), "stale_or_invalid")
        self.assertEqual(gateway.handle(request, c, 2100, 100, True), "accepted")
        self.assertEqual(gateway.handle(dict(request, state_version=c.version), c, 2101, 100, True), "replay")
        gateway.publish(c, 2101)
        self.assertEqual(transport.reports[-1]["person_count"], 2)
        self.assertEqual(transport.reports[-1]["sim_ac_state"], "UNKNOWN")

    def test_polling_echo_backend_times_out_both_edges(self):
        class Pin:
            def __init__(self, values=()):
                self.values = iter(values)
                self.writes = []

            def read(self):
                return next(self.values)

            def write(self, value):
                self.writes.append(value)

        def read(values):
            current = iter(range(1000))
            callback = make_echo_reader(lambda: next(current), lambda a, b: a - b, lambda _: None)
            trigger = Pin()
            result = callback(trigger, Pin(values), 5)
            self.assertEqual(trigger.writes, [0, 1, 0])
            return result

        self.assertIsNone(read([0] * 20))
        self.assertIsNone(read([0, 1] + [1] * 20))
        self.assertEqual(read([0, 0, 1, 1, 0]), 2)

    def test_mock_runtime_polls_reports_and_invalidates_on_disconnect(self):
        controller = empty()
        adapter = MockTransport()
        adapter.current_context = (True, 100, MONDAY)
        runtime = CloudRuntime(adapter, lambda _: True)
        adapter.inbox.append(dict(action="calibrate", member_id="mock-member", person_count=4, request_id="update",
                                  nonce="n", boot_session="boot",
                                  state_version=controller.version, expires_utc=110))
        runtime.poll(controller, "boot", 2100)
        self.assertTrue(adapter.replies[-1]["ok"])
        self.assertEqual(adapter.reports[-1]["person_count"], 4)
        adapter.current_context = (False, None, None)
        runtime.poll(controller, "boot", 2200)
        self.assertFalse(controller.online)

    def test_app_confirmation_requires_member_room_attestation(self):
        c = empty()
        c.tick(902000)
        gateway = CloudGateway(MockTransport(), lambda _: True, "boot")
        request = dict(action="confirm", member_id="member", request_id="r", nonce="n",
                       boot_session="boot", state_version=c.version, expires_utc=110)
        self.assertEqual(gateway.handle(request, c, 902001, 100, True), "room_check_required")
        request.update(room_checked=True, request_id="r2", nonce="n2")
        self.assertEqual(gateway.handle(request, c, 902002, 100, True), "accepted")
        self.assertEqual(c.status(902002)["application_status"], "CONFIRMED")
        self.assertIsNone(c.prepare(902003))
