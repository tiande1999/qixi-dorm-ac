"""Fill from the actual board; never copy arbitrary GPIO numbers from a tutorial."""
BOARD_VERIFIED = False
BOARD_MODEL = "TODO"
IO_VOLTAGE = None
UART_NAME = None                  # e.g. actual supported 'UART1'; not preselected
UART_TX_PAD = "TODO"              # physical silk/pad label, for wiring review
UART_RX_PAD = "TODO"
PINS = {                          # names must exist on machine.Pin
    "trigger": None, "echo": None, "ky": None, "door": None, "arm": None,
    "plus": None, "minus": None, "confirm": None,
}
ACTIVE_LEVEL = {"ky": 0, "door": 0, "arm": 0,
                "plus": 0, "minus": 0, "confirm": 0}
# door active means closed; arm active means RUN. DPDT switch: one pole
# physically disconnects IR LED power, the other connects arm GPIO to GND.
KY_DEBOUNCE_MS = 20
ULTRASONIC_ENTER_MM = 550
ULTRASONIC_RELEASE_MM = 650
ULTRASONIC_PERIOD_MS = 70
ULTRASONIC_STALE_MS = 250
ULTRASONIC_ECHO_TIMEOUT_US = 25000
PASSAGE_TIMEOUT_MS = 3500
OUTER_SENSOR = 2                 # HC-SR04 outside zone, KY-032 inside zone; verify on site
CONTROL_MODE = "REAL_CONFIRM"
SIM_ISOLATION_VERIFIED = False
BUTTON_DEBOUNCE_MS = 30
DELAY_MS = 900000                 # real build refuses smaller values
QUEUE_SIZE = 128
MAX_EVENT_AGE_MS = 500
WDT_PERIOD_MS = 10000


def validate():
    if not BOARD_VERIFIED or BOARD_MODEL == "TODO":
        raise ValueError("Fill and verify board_config.py before connecting hardware")
    if IO_VOLTAGE not in (1.8, 3.3) or not UART_NAME:
        raise ValueError("Verify IO voltage and actual UART mapping")
    if UART_TX_PAD == "TODO" or UART_RX_PAD == "TODO":
        raise ValueError("Record physical UART TX/RX pads")
    if any(not isinstance(p, str) or not p.startswith("GPIO") for p in PINS.values()):
        raise ValueError("Every signal needs a verified GPIO constant name")
    if len(set(PINS.values())) != len(PINS):
        raise ValueError("GPIO assignments must be unique")
    if DELAY_MS != 900000:
        raise ValueError("Do not accelerate the real-AC controller")
