# AI 接手指南

先读 [最新决策](DECISIONS_LATEST.md)、[系统架构](ARCHITECTURE.md)和[当前状态](STATUS.md)。老计划位于 `planning/`，用于追溯历史。

- `firmware/eg800z/inputs.py` 与 `main.py` 负责超声回波转换、门磁和 KY-032 采样，轨迹逻辑位于 `counter.py`。
- `controller.py` 决定权限，`link.py` 与 ESP 的执行保护构成短时握手。
- `cloud.py` 是飞鸢适配边界，`diagnose.py` 可在 QPYcom 核验 SDK。
- `firmware/esp8266/src/sim_receiver.cpp` 是独立红外接收程序，LED 对应模拟空调。
- `web/dist/` 是纯网页演示。固定 900 秒，历史浏览器偏好只能恢复房型与引导状态。Live 已有独立构建，接入见 [Live 接入契约](HABITAT_LIVE.md)。
- 开发时执行 `python tools/check.py`。PC 测试、ESP 构建、板卡连接和真实现场验收应分别记录。
