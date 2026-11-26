# 栖息网页演示

`dist/` 可通过任意静态文件服务运行。从本目录执行 `python -m http.server 8080 --directory dist`，在浏览器打开本机 8080 端口。

网页提供 4/6 人寝、人数校准流程、红外配对教程、虚拟计时、关机优先提醒、桌面安装与通知引导。虚拟等待固定 900 秒，可以快进。模拟可提前确认或到期自动关闭模拟空调。真实模式由 EG800Z 在 900 秒后建立待成员确认的申请。

网页仅有模拟数据和模拟反馈。手机桌面入口使用 manifest 和 Service Worker。浏览器通知能力取决于平台及授权。

运行 `node --test web/tests/*.test.mjs`（从仓库根目录）或 `python tools/check.py`。PWA 去留与嵌入方式为 `PENDING_DECISION`，真实设备优先使用移联万物。
