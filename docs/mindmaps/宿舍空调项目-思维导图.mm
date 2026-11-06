<?xml version='1.0' encoding='utf-8'?>
<map version="1.0.1">
  <node TEXT="宿舍空调自动关机｜v3.0｜EG800Z + ESP8266">
    <node TEXT="01｜基础环境与低压供电" POSITION="left" COLOR="#2563EB">
      <node TEXT="需要学习">
        <node TEXT="Python函数、模块、异常和日志" />
        <node TEXT="电压/电流/上拉/共地，万用表使用" />
        <node TEXT="QPYcom、QuecPython REPL、Arduino/PlatformIO" />
      </node>
      <node TEXT="实现路径">
        <node TEXT="核对EG800Z版本和GPIO电压" />
        <node TEXT="分别跑通EG脚本和ESP下载" />
        <node TEXT="完成电平适配与供电检查，再接外设" />
      </node>
      <node TEXT="安装位置">
        <node TEXT="控制盒放门内固定墙面，约1.3～1.5米高" />
      </node>
      <node TEXT="接口连接">
        <node TEXT="低压电源 → EG、ESP、传感器；GPIO电平先实测" />
      </node>
      <node TEXT="验收标准">
        <node TEXT="两板独立运行；引脚/电压/供电记录完整" />
      </node>
      <node TEXT="现有源码">
        <node TEXT="board_config.py、main.py、platformio.ini" />
      </node>
    </node>
    <node TEXT="02｜双红外与门磁采集" POSITION="left" COLOR="#0891B2">
      <node TEXT="需要学习">
        <node TEXT="漫反射红外与对射的区别" />
        <node TEXT="GPIO输入、上下拉、光耦/电平转换" />
        <node TEXT="中断、时间戳、消抖、固定容量事件队列" />
      </node>
      <node TEXT="实现路径">
        <node TEXT="单独读A/B/门磁" />
        <node TEXT="记录触发与释放时间" />
        <node TEXT="单侧可调支架试装，测远侧漏检和门板干扰" />
      </node>
      <node TEXT="安装位置">
        <node TEXT="门锁侧固定支架；高0.9～1.1米；A/B前后约20厘米" />
      </node>
      <node TEXT="接口连接">
        <node TEXT="A/B/门磁 → EG GPIO → 原始事件队列" />
      </node>
      <node TEXT="验收标准">
        <node TEXT="深浅衣服及两侧均可检；空开关门不计人" />
      </node>
      <node TEXT="现有源码">
        <node TEXT="inputs.py、main.py" />
      </node>
    </node>
    <node TEXT="03｜进出识别与人数校准" POSITION="left" COLOR="#7C3AED">
      <node TEXT="需要学习">
        <node TEXT="有限状态机、完整轨迹、超时与折返" />
        <node TEXT="累计计数的误差及未知/不可信状态" />
        <node TEXT="单元测试、原始事件回放" />
      </node>
      <node TEXT="实现路径">
        <node TEXT="电脑回放A→B/B→A轨迹" />
        <node TEXT="实现进+1、出−1和异常暂停" />
        <node TEXT="移植到EG；本地按键校准实有人数" />
      </node>
      <node TEXT="安装位置">
        <node TEXT="逻辑运行在EG；按键和显示安装在控制盒" />
      </node>
      <node TEXT="接口连接">
        <node TEXT="传感器事件 → count / trusted / state_version" />
      </node>
      <node TEXT="验收标准">
        <node TEXT="正常通行100次对账；歧义不静默变成零" />
      </node>
      <node TEXT="现有源码">
        <node TEXT="counter.py、controller.py、ui.py" />
      </node>
    </node>
    <node TEXT="04｜空调学习与红外执行" POSITION="right" COLOR="#EA580C">
      <node TEXT="需要学习">
        <node TEXT="红外载波、完整状态帧、独立OFF与切换键" />
        <node TEXT="IRremoteESP8266、接收解码、原始时序" />
        <node TEXT="MOSFET驱动、限流、LittleFS配置持久化" />
      </node>
      <node TEXT="实现路径">
        <node TEXT="接收原遥控器的OFF两次" />
        <node TEXT="ESP试发：开机能关、已关不再开" />
        <node TEXT="验证其他原运行模式，保存该空调配置" />
      </node>
      <node TEXT="安装位置">
        <node TEXT="接收头在盒正面；发射头靠空调接收窗约5～15厘米" />
      </node>
      <node TEXT="接口连接">
        <node TEXT="遥控器 → ESP学习；EG许可 → ESP → 红外 → 空调" />
      </node>
      <node TEXT="验收标准">
        <node TEXT="真实空调响应；只登记经过验证的关机配置" />
      </node>
      <node TEXT="现有源码">
        <node TEXT="ESP main.cpp、ir_profile.h" />
      </node>
    </node>
    <node TEXT="05｜本地15分钟自动决策" POSITION="right" COLOR="#059669">
      <node TEXT="需要学习">
        <node TEXT="非阻塞调度、单调计时、计数器回绕" />
        <node TEXT="状态版本、取消条件、一次性执行" />
        <node TEXT="故障降级与断网独立运行" />
      </node>
      <node TEXT="实现路径">
        <node TEXT="人数有效且为零、门关稳定2秒" />
        <node TEXT="本地连续计时900秒" />
        <node TEXT="到期复核条件，发放一次OFF许可" />
      </node>
      <node TEXT="安装位置">
        <node TEXT="只在EG决策；不依赖云端或手机确认" />
      </node>
      <node TEXT="接口连接">
        <node TEXT="人数+门磁+模式+执行器就绪 → 关机请求" />
      </node>
      <node TEXT="验收标准">
        <node TEXT="899秒进入可取消；同次空房只尝试一次" />
      </node>
      <node TEXT="现有源码">
        <node TEXT="controller.py、timebase.py" />
      </node>
    </node>
    <node TEXT="06｜板间连接、交互与整体验收" POSITION="right" COLOR="#DB2777">
      <node TEXT="需要学习">
        <node TEXT="UART 9600/8N1、CRC、会话与命令编号" />
        <node TEXT="PREPARE→READY→COMMIT、2秒临时许可" />
        <node TEXT="OLED I²C、按键长按、故障注入与日志对照" />
      </node>
      <node TEXT="实现路径">
        <node TEXT="短UART交叉连接并适配电平" />
        <node TEXT="接小屏、校准键、学习向导、双刀暂停开关" />
        <node TEXT="验证旧帧/断线/重启，再完成真实15分钟演示" />
      </node>
      <node TEXT="安装位置">
        <node TEXT="EG与ESP同盒；OLED接ESP；暂停开关切发射供电" />
      </node>
      <node TEXT="接口连接">
        <node TEXT="EG↔ESP双向UART；ESP→OLED；按键/门磁→EG" />
      </node>
      <node TEXT="验收标准">
        <node TEXT="日志、屏幕和实物一致；发送成功不冒充关机反馈" />
      </node>
      <node TEXT="现有源码">
        <node TEXT="link.py、protocol.py、ui.py、execution_guard.h" />
      </node>
    </node>
    <node TEXT="项目边界" POSITION="right">
      <node TEXT="新增预算约100元，工具电源借用" />
      <node TEXT="单人依次通行原型；全天本地自动；断网继续" />
      <node TEXT="人数来自进出累计，不能把没有动作等同无人" />
      <node TEXT="真实空调关机到待机，不改市电、不强制断电" />
      <node TEXT="不承诺所有品牌兼容；每台需首次学习和验证" />
    </node>
    <node TEXT="实施顺序" POSITION="right">
      <node TEXT="W1环境供电" />
      <node TEXT="W2先验证真实空调OFF" />
      <node TEXT="W3门口采集安装" />
      <node TEXT="W4人数状态机" />
      <node TEXT="W5串口+15分钟闭环" />
      <node TEXT="W6故障测试与固定安装" />
      <node TEXT="W7现场对账" />
      <node TEXT="W8文档视频与交接" />
    </node>
    <node TEXT="当前进度" POSITION="right">
      <node TEXT="已有EG和ESP固件源码" />
      <node TEXT="49项Python电脑端逻辑测试通过" />
      <node TEXT="ESP完整编译尚未验证" />
      <node TEXT="板卡版次、GPIO电平、门宽、空调协议待实测" />
      <node TEXT="尚未完成采购、安装、真实红外与真实空调验收" />
    </node>
  </node>
</map>