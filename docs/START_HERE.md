# 开发启动

1. 在项目根目录运行 `python tools/check.py`。
2. 用 PlatformIO 构建 `python -m platformio run -d firmware/esp8266 -e nodemcuv2 -e sim_tx -e sim_rx`。默认 `nodemcuv2` 供普通诊断，隔离台架分别使用 `sim_tx` 和 `sim_rx`。
3. 在 EG800Z 的 QPYcom REPL 中运行 `import diagnose; diagnose.report()`，记录板卡丝印、完整料号和固件版本。
4. 按[接线说明](../hardware/wiring.md)核对硬件，把确认的引脚录入 `board_config.py`，提供经实测的 `main.start(echo_reader=...)` 回调。
5. 捕获门口原始时间线。先确认进出方向和初始人数，再试门开、折返、短遮挡、超声回波丢失和连续通行。
6. 完成物理隔离后才启用 SIM_AUTO 和模拟发射构建。接收板上电带亮 LED 作为初始开机条件；观察 900 秒后独立接收板打印 `SIM_RX OFF`，LED 熄灭。断开发射头或遮住光路复测，LED 应保持亮。
7. 搭建飞鸢产品物模型和官方 App 测试，参考[接入说明](FEIYUAN.md)。
