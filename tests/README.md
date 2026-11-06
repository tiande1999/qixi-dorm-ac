# 测试怎么分

- `tests/firmware/`：Python 标准库单元测试，验证 EG 的计数、异常、计时、校准和串口逻辑。
- `web/tests/`：Node 原生测试，验证网页状态、房型设置、提前确认、到点执行和通知行为。

从仓库根目录运行全部：

```sh
python tools/check.py
```

也可以分别运行：

```sh
python -m unittest discover -s tests/firmware -v
node --test web/tests/store.test.mjs web/tests/preferences.test.mjs web/tests/phone.test.mjs
```

这些测试不需要账号、开发板或真实空调，也不会烧录。ESP 完整编译和实际两板联动不在这组测试的覆盖范围。

真实验收仍要完成：通道覆盖、无人开关门 20 次、真人通行 100 次、室内留人、不同空调初始状态的 OFF、重复 OFF、完整 900 秒、接近第 899 秒取消、断线和重启。原始记录与失败后的复测都要保留。
