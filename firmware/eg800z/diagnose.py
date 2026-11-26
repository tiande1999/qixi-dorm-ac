"""Read-only QPYcom diagnostic. Does not connect, print credentials or flash."""
def report():
    for name in ("machine", "utime", "Qth", "quecIot"):
        try:
            module = __import__(name)
        except ImportError:
            print(name, "absent")
            continue
        symbols = ("Pin", "ExtInt", "time_pulse_us", "ticks_us", "sleep_us",
                   "init", "phymodelReport", "setEventCB")
        print(name, "present", [symbol for symbol in symbols if hasattr(module, symbol)])
    try:
        import modem
        print("firmware", modem.getDevFwVersion())
    except (ImportError, AttributeError):
        print("firmware version API unavailable")
