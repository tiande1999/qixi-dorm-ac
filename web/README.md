# Habitat PWA

**Habitat Demo** 用于比赛与离线体验。首次打开可选 4/6 人寝、学习红外流程和查看安装教程。默认空房持续 900 秒后等待成员确认。演示台可推进虚拟时钟，体验否决、再次进门、故障和模拟接收。全自动模式只处理模拟空调。

**Habitat Live** 用于查看经授权的真实 EG800Z 数据。首页右上角「使用教程」包含连接、读数、操作、安装四步；「设备管理」可直接打开手机安装步骤。未配置时人数、倒计时和模拟空调状态均显示未知。完成同源网关联调后可显示设备报告与获准操作。真实空调控制当前禁用。

| 版本 | 构建命令 | 发布目录 | 本机预览 |
|---|---|---|---|
| Demo | npm --prefix web run build:demo | artifacts/habitat-demo/ | npm --prefix web run preview:demo，端口 4173 |
| Live | npm --prefix web run build:live | artifacts/habitat-live/ | npm --prefix web run preview:live，端口 4174 |

命令从仓库根目录运行。测试用 python tools/check.py。接入已验证网关时，从环境注入 HABITAT_GATEWAY_PATH，见 .env.example。Node.js 只用于构建和测试。

将两版分别上传 HTTPS 静态托管，根目录应有 index.html。独立域名或带尾斜线的兄弟路径均可。旧站曾把 Demo Worker 注册到根目录时，给 Live 使用独立域名。两版各有 manifest ID、名称、Worker scope、缓存和可区分的图标。Live 的 Worker 仅缓存静态壳，私有数据请求走网络。

iPhone 在 Safari 的共享菜单选“添加到主屏幕”。Android 在 Chrome 菜单选“安装应用”或“添加到主屏幕”。先联网打开一次，让 Worker 安装，再测试离线刷新。Live 当前提供网页打开时的消息视图，后台推送需要另行联调。

源码位于 dist/（Demo 页面、模拟器、教程、共享样式与组件）和 live/（Live 入口、适配器、Worker 模板）。model/feiyuan-xls.json 提供构建生成的模型字段。HTTP 测试替身只用于测试。

接入详见 [Live 接入契约](../docs/HABITAT_LIVE.md)。
