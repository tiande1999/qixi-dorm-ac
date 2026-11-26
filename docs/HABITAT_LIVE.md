# Habitat Live 飞鸢接入

EG800Z 负责人数、固定 900 秒、工作日控制窗口和执行许可。飞鸢连设备，Live 通过同源网关显示经过授权的设备信息。移联万物 App 可并行辅助调试。

## 物模型核对

用 xlrd 读取原生 p11A1Y_20261126174653007.xls 的 sheet0，获得 25 属性、6 服务、4 事件。功能 ID 与任务书一致，六个服务为 ASYNC，事件等级为 19 INFO、20 WARN、21 INFO、22 ERROR。早期原生 p11A1Y_20261126174216198.json 只有 13 属性与 1 个测试服务。还需用飞鸢部署后的完整原生 JSON 对照正式版本与字段。

web/model/feiyuan-xls.json 摘录 ID、类型、值域、输入输出引用，省略产品元数据。测试验证属性引用对象及 6 项服务、4 项事件的参数映射。模型描述不指定 HTTP 报文，真实上下行须按联调结果转换。

## 应用网关契约

飞鸢公开资料列出设备接入、设备管理、消息订阅与 REST API。QuecPython SDK 面向模组。公开资料不足以验证本项目浏览器 CORS、短期用户级令牌、设备 ACL 和异步结果链路，因此选用同源网关契约。当前构建默认网关为空。 [飞鸢官网](https://www.quectel.com.cn/iotplatform/iot-platform) · [移远开放 API 概览](https://uat-web-iot.quectelcn.com/productServe/devicemanage)

| 方法和路径 | 响应或语义 |
|---|---|
| GET /session | accountId、device（id、label、capacity）、services（授权标识符）、eventsAvailable。未登录 401，越权 403。 |
| GET /devices/{id}/snapshot | deviceId、跨设备重启单调递增的 sequence、带时区 reportedAt、平台 platformOnline、以数字 ID 索引的 properties。 |
| GET /devices/{id}/events | 每项 deviceId、id、eventId、at、message。缺少能力时将 eventsAvailable 设为 false。 |
| POST /devices/{id}/requests | serviceId 与按标识符索引的 params。回执含 requestId、status、message，设备上下文变化返回 409。 |
| GET /devices/{id}/requests/{requestId} | 查询同账号同设备回执。 |
| POST /logout | 吊销会话并清除 Cookie。 |

以上是 Habitat 路径。网关提供安全 Cookie 会话、成员与设备级授权、来源与 CSRF 校验、输入验证、限流和审计。平台凭据存网关 secret。设备与网关同时校验请求编号、防重放、状态会话、当前版本与有效期。所有设备响应使用 Cache-Control: no-store，禁用离线队列。网关返回受控的七阶段结果及 unknown，设备已接受和执行完成分别显示。页面默认前台每 10 秒刷新，失败退避到 60 秒。

## 固件协作

- 当前 EG800Z Mock 上报字符串，XLS 使用数字枚举。door_status 表示通行空闲、检测中或异常，与门磁开关语义不同。
- 模拟空调报告需要独立接收反馈。现在 ESP B 的接收结果只在 LED 和串口，待建立可信反馈再给网关的 simFeedbackVerified。
- shutdown_pending 只能提示存在申请。需要本次任务 ID、有效期、会话和版本才能建立 currentTask。事件 19 缺少有效期，不能从历史事件推断。由设备确认回读方式或提出只读补充字段。
- Live 中真实关机确认始终禁用。校准、暂停、恢复、模拟模式、否决须由网关授予能力并由设备最终判定。调用失败时页面保留设备报告并重新同步。
- 板上时间、设备认证、授权边界、报告频率、事件和服务路径均待联调。若推送需常驻 AMQP 消费，再评估官方查询或托管集成。尚无正式 Web Push 或规则引擎依赖。

## 最小联调条件

1. 在飞鸢发布物模型并导出完整原生 JSON。
2. 在 SaaS 应用页授权测试产品，取得非敏感北向接口说明、认证流程与限流。API 密钥通过部署环境注入。
3. 绑定一台 EG800Z 测试设备和两个不同权限的成员，先验证读取与越权拒绝，再验证校准、暂停、否决和独立接收结果。
4. 部署启用真实鉴权的网关后配置 HABITAT_GATEWAY_PATH，从 HTTPS 预览访问。
