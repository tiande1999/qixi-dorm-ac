# 栖息 · EG800Z 宿舍空调管理

栖息使用门口的 HC-SR04、KY-032 和门磁判断宿舍人数，使用 EG800Z 在本地计时和决策。候选空房固定等待 15 分钟。默认真实模式在工作日 08:00–18:00、设备时间可信且联网时登记关机申请，成员需要核实后当次确认，其他成员可以否决。本版真实红外发射保持禁用。

比赛演示使用两块 ESP8266。第一块收取 EG800Z 的 UART 许可，在物理隔离条件下发出模拟 OFF。第二块独立接收红外并驱动 LED。

| 路径 | 内容 |
|---|---|
| [开发启动](docs/START_HERE.md) | 本地验证与板卡联调顺序 |
| [最新决策](docs/DECISIONS_LATEST.md) | 当前范围与 PWA 待决事项 |
| [架构](docs/ARCHITECTURE.md) | 传感器、控制状态、UART、云接口 |
| [飞鸢接入](docs/FEIYUAN.md) | SDK 诊断、物模型、Mock 与待核实能力 |
| [接线](hardware/wiring.md) | 电平、电源、安装和物理隔离 |
| [当前状态](docs/STATUS.md) | 已验证的内容与验收缺口 |
| [网页演示](web/README.md) | 现有 PWA，本地模拟 |
| [AI 接手](docs/AI_HANDOFF.md) | 代码入口和维护边界 |

执行 `python tools/check.py` 运行 Python 和 Node.js 本地测试。Node.js 用于网页测试。真实设备目标是飞鸢 IoT Core 和移联万物 App，设备可以独立运行本地逻辑。

`docs/planning/` 和 `docs/mindmaps/` 是早期方案档案，当前开发以最新决策为准。
