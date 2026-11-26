# 实物引脚记录

EG800Z 的板卡版本仍待记录。把实测信息录入 `firmware/eg800z/board_config.py`。

| 信号 | 方向 | EG800Z 丝印 |
|---|---|---|
| trigger | 出，经适配至 HC-SR04 Trig | 待测 |
| echo | 入，经适配接 HC-SR04 Echo | 待测 |
| ky | 入，经适配接 KY-032 信号 | 待测 |
| door / arm | 入，门磁和暂停开关 | 待测 |
| plus / minus / confirm | 入，校准按键 | 待测 |
| UART TX / RX | 双向分别适配，9600 8N1 | 待测 |

ESP A 使用 GPIO14 发射、GPIO13 学习接收、GPIO12/16 串口 RX/TX，4/5 可接 OLED。ESP B 使用 GPIO13 接收，板载 LED 显示结果。以 GPIO 编号核对板卡丝印。
