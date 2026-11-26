import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "firmware" / "eg800z"))
from counter import Counter
from controller import Controller, SIM_AUTO
from inputs import Ring, Debouncer, Buttons
from link import Link
from protocol import crc16, encode, decode, Decoder
from timebase import add, diff, PERIOD
from ui import UI
import board_config


def passage(controller, masks, start=100, step=100):
    for index, mask in enumerate(masks):
        now = add(start, index * step)
        controller.raw_inputs(mask, True, True, now)
        controller.sensor(mask, now)
    return now


def armed_empty(start=0):
    c = Controller(mode=SIM_AUTO, isolated=True)
    c.raw_inputs(0, True, True, start)
    c.set_link(True, "0000ABCD", start)
    assert c.calibrate(0, start)
    c.tick(add(start, 2000))
    return c


class CounterTests(unittest.TestCase):
    def test_four_supported_paths(self):
        for path, expected in [(p, 1 if p[0] == 2 else -1) for p in Counter.PATHS]:
            with self.subTest(path=path):
                counter = Counter(timeout_ms=3000)
                events = [counter.feed(mask, n * 100) for n, mask in enumerate(path)]
                self.assertEqual([x for x in events if x], [{"delta": expected}])
                self.assertTrue(counter.idle())

    def test_duplicate_levels_do_not_double_count(self):
        counter = Counter(timeout_ms=3000)
        events = [counter.feed(m, i * 100) for i, m in enumerate([2, 2, 3, 3, 1, 1, 0, 0])]
        self.assertEqual([e for e in events if e], [{"delta": 1}])

    def test_turnaround_is_ambiguous(self):
        c = Counter(timeout_ms=3000)
        events = [c.feed(m, i * 100) for i, m in enumerate([2, 3, 2, 0])]
        self.assertEqual([e for e in events if e], [{"fault": "ambiguous_passage"}])

    def test_simultaneous_start_and_clear(self):
        c = Counter(timeout_ms=3000)
        self.assertIn("fault", c.feed(3, 0))
        self.assertIsNone(c.feed(1, 100))
        self.assertIsNone(c.feed(0, 200))
        self.assertTrue(c.idle())

    def test_abandoned_single_sensor_times_out(self):
        c = Counter(timeout_ms=3000)
        c.feed(2, 100)
        c.feed(0, 200)
        self.assertFalse(c.idle())
        self.assertEqual(c.tick(3100), {"fault": "passage_timeout"})
        self.assertTrue(c.idle())

    def test_late_second_zone_cannot_complete(self):
        c = Counter(timeout_ms=3000)
        c.feed(2, 0)
        c.feed(0, 100)
        self.assertIn("fault", c.feed(1, 3000))
        self.assertIsNone(c.feed(0, 3100))

    def test_timeout_across_wrap(self):
        c = Counter(timeout_ms=3000)
        c.feed(2, PERIOD - 1000)
        self.assertIsNone(c.tick(1999))
        self.assertIn("fault", c.tick(2000))

    def test_100_complete_single_person_passages(self):
        c = Controller()
        c.calibrate(1, 0)
        for i in range(100):
            going_out = i % 2 == 0
            passage(c, [1, 3, 2, 0] if going_out else [2, 3, 1, 0], i * 1000)
            self.assertEqual(c.count, 0 if going_out else 1)
            self.assertTrue(c.trusted)


class ControllerTests(unittest.TestCase):
    def test_boot_unknown_even_with_clear_sensors(self):
        c = Controller()
        c.raw_inputs(0, True, True, 0)
        c.set_link(True, "profile", 0)
        self.assertFalse(c.tick(10000000))
        self.assertIsNone(c.count)

    def test_exact_15_minutes_after_door_stability(self):
        c = armed_empty()
        self.assertFalse(c.tick(901999))
        self.assertTrue(c.tick(902000))

    def test_real_delay_cannot_be_accelerated(self):
        with self.assertRaises(ValueError):
            Controller(delay_ms=1000)

    def test_calibration_zero_does_not_immediately_send(self):
        c = armed_empty()
        self.assertIsNone(c.prepare(2001))

    def test_one_to_zero_is_normal(self):
        c = armed_empty()
        c.calibrate(1, 0)
        passage(c, [1, 3, 2, 0])
        self.assertEqual(c.count, 0)
        self.assertTrue(c.trusted)

    def test_underflow_does_not_become_valid_zero(self):
        c = armed_empty()
        passage(c, [1, 3, 2, 0])
        self.assertEqual(c.count, 0)
        self.assertFalse(c.trusted)
        self.assertEqual(c.reason, "count_underflow")

    def test_no_calibration_during_incomplete_passage(self):
        c = armed_empty()
        passage(c, [2, 0])
        self.assertFalse(c.calibrate(0, 500))

    def test_bad_calibration_values(self):
        c = Controller()
        for number in (-1, 100, True, 0.0, "0"):
            self.assertFalse(c.calibrate(number, 0))

    def test_anomaly_keeps_count_but_removes_trust(self):
        c = armed_empty()
        c.calibrate(4, 0)
        passage(c, [2, 3, 2, 0])
        self.assertEqual(c.count, 4)
        self.assertFalse(c.trusted)

    def test_person_returning_at_899_seconds(self):
        c = armed_empty()
        c.tick(901000)
        c.raw_inputs(2, True, True, 901000)
        self.assertFalse(c.tick(902000))
        self.assertIsNone(c.empty_since)

    def test_raw_pulse_cancels_before_debounce(self):
        c = armed_empty()
        version = c.prepare(902000)
        c.raw_inputs(2, True, True, 902001)
        self.assertFalse(c.can_commit(version, 902001))

    def test_open_and_close_requires_fresh_timer(self):
        c = armed_empty()
        c.raw_inputs(0, False, True, 901000)
        c.tick(901000)
        c.raw_inputs(0, True, True, 902000)
        self.assertFalse(c.tick(904000))
        self.assertFalse(c.tick(1803999))
        self.assertTrue(c.tick(1804000))

    def test_pause_cancels_prepared_permission(self):
        c = armed_empty()
        version = c.prepare(902000)
        c.raw_inputs(0, True, False, 902001)
        self.assertFalse(c.can_commit(version, 902001))

    def test_fault_cancels_permission(self):
        for reason in ("irq_queue_overflow", "stale_sensor_event", "main_loop_late"):
            with self.subTest(reason=reason):
                c = armed_empty()
                version = c.prepare(902000)
                c.fault(reason, 902001)
                self.assertFalse(c.can_commit(version, 902001))

    def test_once_per_empty_episode(self):
        c = armed_empty()
        self.assertIsNotNone(c.prepare(902000))
        c.dispatched(902001)
        for t in (1804000, 3608000, 10000000):
            self.assertFalse(c.tick(t))
            self.assertIsNone(c.prepare(t))
        c.raw_inputs(0, False, True, 10000001)
        c.raw_inputs(0, True, True, 10000002)
        self.assertFalse(c.tick(12000000))

    def test_new_occupied_episode_rearms(self):
        c = armed_empty()
        c.dispatched(902000)
        passage(c, [2, 3, 1, 0], 903000)
        self.assertFalse(c.episode_done)
        passage(c, [1, 3, 2, 0], 904000)
        self.assertFalse(c.tick(904300))
        self.assertTrue(c.tick(1804300))

    def test_wrap_safe_15_minutes(self):
        start = PERIOD - 400000
        c = armed_empty(start)
        self.assertFalse(c.tick(add(start, 901999)))
        self.assertTrue(c.tick(add(start, 902000)))

    def test_link_change_restarts_countdown(self):
        c = armed_empty()
        c.set_link(False, "", 900000)
        c.tick(900000)
        c.set_link(True, "0000ABCD", 901000)
        self.assertFalse(c.tick(901000))
        self.assertFalse(c.tick(902000))
        self.assertTrue(c.tick(1801000))

    def test_unknown_actual_ac_state(self):
        c = armed_empty()
        c.dispatched(902000)
        c.result = "ir_tx_finished"
        self.assertEqual(c.status(902001)["ac_actual_state"], "unknown")


class ProtocolTests(unittest.TestCase):
    def test_standard_crc_vector(self):
        self.assertEqual(crc16(b"123456789"), 0x29B1)

    def test_round_trip_and_chunked_stream(self):
        msg = {"v": 1, "t": "P", "e": "12345678", "id": 1}
        encoded = encode(msg)
        self.assertEqual(decode(encoded), msg)
        stream = Decoder()
        results = []
        for byte in encoded:
            results.extend(stream.feed(bytes([byte])))
        self.assertEqual(results, [msg])

    def test_corrupt_frame_then_good_frame(self):
        msg = {"v": 1, "t": "X"}
        frame = encode(msg)
        stream = Decoder()
        self.assertEqual(stream.feed(frame.replace(b'"X"', b'"C"') + frame), [msg])
        self.assertEqual(stream.errors, 1)

    def test_oversize_resynchronizes_at_next_line(self):
        stream = Decoder()
        msg = {"v": 1, "t": "X"}
        self.assertEqual(stream.feed(b"A" * 1000 + b"\n" + encode(msg)), [msg])

    def test_unknown_version_and_bad_types(self):
        for message in ({"v": 2, "t": "C"}, {"v": True, "t": "C"}, {"v": 1, "t": "COMMIT"}):
            with self.assertRaises(ValueError):
                decode(encode(message))


class LinkTests(unittest.TestCase):
    def setUp(self):
        self.c = Controller(mode=SIM_AUTO, isolated=True)
        self.c.raw_inputs(0, True, True, 0)
        self.c.calibrate(0, 0)
        self.link = Link("12345678", self.c)
        self.heartbeat(0)
        self.c.tick(2000)

    def heartbeat(self, now, esp="ABCDEF12", verified=True, profile="0000ABCD"):
        self.link.update(now)
        self.link.receive({"v": 1, "t": "H", "e": self.link.boot, "s": esp,
                           "q": self.link.q, "ok": False, "sim": verified, "p": profile}, now)
        self.link.take_output(now)

    def prepare(self):
        # Advance the virtual clock while preserving live bidirectional heartbeats.
        for now in range(1000, 902000, 1000):
            self.heartbeat(now)
        self.link.update(902000)
        frames = self.link.take_output(902000)
        return next(m for m in frames if m["t"] == "P")

    def ready(self, request, now=902100):
        self.link.receive({"v": 1, "t": "R", "e": self.link.boot,
                           "s": self.link.esp, "id": request["id"], "sv": request["sv"], "k": "AABBCCDD"}, now)

    def test_full_handshake_dispatches_only_once(self):
        request = self.prepare()
        self.ready(request)
        frames = self.link.take_output(902100)
        self.assertEqual(len([m for m in frames if m["t"] == "C"]), 1)
        self.ready(request, 902101)
        self.assertFalse(any(m["t"] == "C" for m in self.link.take_output(902101)))
        self.assertTrue(self.c.episode_done)

    def test_recheck_after_ready_before_write(self):
        request = self.prepare()
        self.ready(request)
        self.c.raw_inputs(2, True, True, 902101)
        self.assertFalse(any(m["t"] == "C" for m in self.link.take_output(902101)))

    def test_ready_expired(self):
        request = self.prepare()
        self.ready(request, 903500)
        self.assertFalse(any(m["t"] == "C" for m in self.link.take_output(903500)))

    def test_wrong_boot_ready_ignored(self):
        request = self.prepare()
        self.link.receive({"v": 1, "t": "R", "e": "OLD_BOOT", "s": self.link.esp,
                           "id": request["id"], "k": "AABBCCDD"}, 902100)
        self.assertFalse(any(m["t"] == "C" for m in self.link.take_output(902100)))

    def test_esp_reboot_invalidates_old_prepare(self):
        request = self.prepare()
        self.heartbeat(903000, esp="FFFFFFFF")
        self.ready(request, 903100)
        self.assertFalse(any(m["t"] == "C" for m in self.link.take_output(903100)))
        self.assertIsNone(self.c.pending_version)

    def test_duplicate_heartbeat_does_not_extend_health(self):
        reply = {"v": 1, "t": "H", "e": self.link.boot, "s": self.link.esp,
                 "q": self.link.q, "ok": True, "p": "0000ABCD"}
        self.link.receive(reply, 500)
        self.assertEqual(self.link.last_reply, 0)
        self.assertFalse(self.link.healthy(3000))

    def test_no_ack_means_unknown_no_resend(self):
        request = self.prepare()
        self.ready(request)
        self.link.take_output(902100)
        self.assertEqual(self.c.result, "result_unknown")
        self.heartbeat(904000)
        self.link.update(1804000)
        self.assertFalse(any(m["t"] in ("P", "C") for m in self.link.take_output(1804000)))

    def test_ack_is_not_actual_ac_feedback(self):
        request = self.prepare()
        self.ready(request)
        self.link.take_output(902100)
        self.link.receive({"v": 1, "t": "A", "e": self.link.boot, "s": self.link.esp,
                           "id": request["id"], "result": "ir_tx_finished"}, 902200)
        self.assertEqual(self.c.result, "ir_tx_finished")
        self.assertEqual(self.c.status(902200)["ac_actual_state"], "unknown")

    def test_sim_disabled_never_prepares(self):
        self.heartbeat(901000, verified=False)
        self.link.update(902000)
        self.assertFalse(any(m["t"] == "P" for m in self.link.take_output(902000)))


class InputAndUITests(unittest.TestCase):
    def test_ring_overflow_and_order(self):
        ring = Ring(2)
        self.assertTrue(ring.push(1))
        self.assertTrue(ring.push(2))
        self.assertFalse(ring.push(3))
        self.assertTrue(ring.overflow)
        self.assertEqual([ring.pop(), ring.pop(), ring.pop()], [1, 2, None])
        self.assertTrue(ring.push(4))
        self.assertEqual(ring.pop(), 4)

    def test_debounce_rejects_short_pulse(self):
        deb = Debouncer(0, 0)
        self.assertIsNone(deb.feed(2, 1))
        self.assertIsNone(deb.feed(0, 5))
        self.assertIsNone(deb.advance(20))
        self.assertEqual(deb.value, 0)

    def test_debounce_accepts_stable_edge(self):
        deb = Debouncer(0, 0)
        deb.feed(2, 1)
        self.assertIsNone(deb.advance(10))
        self.assertEqual(deb.advance(11), 2)

    def test_pair_combo_emits_no_short_press(self):
        b = Buttons()
        b.update({"plus", "minus"}, 0)
        self.assertEqual(b.update({"plus", "minus"}, 2000), ["pair_long"])
        self.assertEqual(b.update(set(), 2001), [])

    def test_long_confirm_emits_no_short_confirm(self):
        b = Buttons()
        b.update({"confirm"}, 0)
        self.assertEqual(b.update({"confirm"}, 2000), ["confirm_long"])
        self.assertEqual(b.update(set(), 2100), [])

    def test_local_calibration_flow(self):
        c = Controller()
        link = Link("12345678", c)
        ui = UI(c, link)
        ui.handle("confirm_long", 0)
        ui.handle("plus", 1)
        ui.handle("confirm", 2)
        self.assertEqual(c.count, 1)
        self.assertEqual(c.ui_mode, "RUN")
        self.assertTrue(c.trusted)

    def test_learning_requires_recalibration(self):
        c = armed_empty()
        c.set_ui_mode("LEARN", 3000)
        self.assertFalse(c.trusted)
        self.assertFalse(c.tick(1000000))

    def test_default_board_config_refuses_unknown_wiring(self):
        with self.assertRaises(ValueError):
            board_config.validate()


if __name__ == "__main__":
    unittest.main()
