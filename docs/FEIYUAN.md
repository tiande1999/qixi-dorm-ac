# 飞鸢 IoT Core 接入

设备使用移动网络接入飞鸢，成员使用移联万物 App。先在 QPYcom 运行 `diagnose.report()`，记录模组完整料号、固件版本和 `Qth` / `quecIot` 是否可导入。根据移远与比赛方提供的兼容表使用明确匹配的 SDK。官方介绍了 QuecPython 接入和物模型生成界面；现有 Python 指南以 `quecIot.phymodelReport` 为例，板卡固件实际支持情况需要诊断。 [官方快速启动](https://www.quectel.com.cn/iotplatform/quick-start)

移远官方社区回复说明标准 QuecPython 默认不含 QTH SDK，需从开发者中心下载匹配组件。运行诊断后再决定固件集成方式。 [移远官方社区回复](https://forumschinese.quectel.com/t/topic/15399/2)

## 物模型建议

| 标识符 | 类型 | 方向 |
|---|---|---|
| person_count | 整数，可未知 | 设备上报 |
| count_status | NORMAL / SUSPECT / UNKNOWN | 设备上报 |
| door_status | OPEN / CLOSED | 设备上报 |
| device_mode | REAL_CONFIRM / SIM_AUTO / REMIND_ONLY | 设备上报 |
| state_version | 整数 | 设备上报 |
| countdown_seconds | 整数，可未知 | 设备上报 |
| network_status | 布尔 | 设备上报 |
| sim_ac_state | UNKNOWN / ON / OFF | 设备上报，当前始终 UNKNOWN |
| last_error | 文本 | 设备上报 |
| application_version / application_status / last_result | 状态 | 设备上报 |

飞鸢的能力范围确认后，将未知的可选整数字段映射为省略字段，并用状态枚举表达未知。设备端保持权威人数。禁止将普通写属性映射为成员校准或确认。

`CloudRuntime` 的适配器提供 `context()`、`receive()`、`publish()` 和 `reply()`。设备认证、可信 UTC/北京时间、平台属性 ID 和上报事件由兼容 SDK 驱动。校准与确认请求另需可验证的成员身份及消息完整性验证器。验证器接入前应拒绝业务请求。PC 测试的 Mock 成员凭证仅用于测试。

设备侧检查请求编号、nonce、启动会话、状态版本和 60 秒内的有效期，并生成回执。经鉴别的成员编号用于审计，确认请求须明确包含已核实房间。具备可信成员身份后，再联调状态查询、校准、模拟暂停与恢复。模拟接收板独立运行，云端没有接收 LED 的反馈，模拟状态保持 UNKNOWN。

设备实际认证、App 操作者身份、成员否决与暂停、SDK 回调映射仍需现场验证。公开仓库不包含设备密钥或管理员凭据。
