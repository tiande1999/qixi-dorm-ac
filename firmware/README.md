# 设备程序

这里保留已有的 EG800Z 和 ESP8266 程序基础。本次只整理目录，没有修改现场控制规则，也没有填入未经实测的引脚。

## EG800Z：负责决定什么时候关机

| 文件 | 负责什么 |
|---|---|
| `eg800z/main.py` | 外设初始化、输入采集、循环、看门狗 |
| `eg800z/board_config.py` | 需要现场核对的型号、电平、GPIO 与 UART |
| `eg800z/inputs.py` | 输入队列、消抖、按键 |
| `eg800z/counter.py` | A/B 轨迹与进出方向 |
| `eg800z/controller.py` | 人数、可信度、关门、900 秒和异常 |
| `eg800z/link.py` | 会话、心跳、准备 / 提交与取消 |
| `eg800z/protocol.py` | 串口帧、校验和解析 |
| `eg800z/timebase.py` | 单调时间及回绕处理 |
| `eg800z/ui.py` | 本地人数校准和学习操作 |

电脑上可以先运行 `python -m unittest discover -s tests/firmware -v`（从仓库根目录）。测试不需要真实 GPIO。

实物阶段先填 [引脚记录表](../hardware/pin-map.md)，核对后修改 `board_config.py`。`BOARD_VERIFIED=False` 是当前正常默认值；验证不通过时程序会停止，不应为了“先跑起来”跳过检查。

确认板卡和 QuecPython 固件兼容后，将 `eg800z/` 中全部 `.py` 文件上传到板卡 `/usr`，通过 QPYcom 执行 `import main; main.start()`。这一步需要实际设备，不能把电脑逻辑测试当作上板结果。

## ESP8266：负责学习和发射

| 文件 | 负责什么 |
|---|---|
| `esp8266/platformio.ini` | NodeMCU 开发配置和固定依赖版本 |
| `esp8266/src/main.cpp` | 学习流程、屏幕、串口和发射协作 |
| `esp8266/include/ir_profile.h` | 完整红外配置、校验、保存与发射 |
| `esp8266/include/execution_guard.h` | 短期执行标识、过期与去重 |
| `esp8266/include/wire_protocol.h` | 与 EG 对应的串口帧解析 |

安装 PlatformIO 后，在仓库根目录编译：

```sh
pio run -d firmware/esp8266
```

当前没有完整编译成功记录，因此不要把这一命令列为已经验证的结果。确定实际 ESP 板型和串口后再烧录；本仓库没有自动烧录脚本。

固件中的串口、OLED 和红外脚位是预分配值，见 [接线关系](../hardware/wiring.md)。目标空调的 OFF 需要原装遥控器采集，并用真实空调验证；只有电源切换而没有稳定独立 OFF 的配置不能作为自动关机配置。

当前依赖固定为 `espressif8266 4.2.1`、`IRremoteESP8266 2.8.6`、`ArduinoJson 6.21.5`、`EspSoftwareSerial 8.2.0`、`Adafruit SSD1306 2.5.13`、`Adafruit GFX 1.11.11`，以 `platformio.ini` 为准。
