<?xml version='1.0' encoding='utf-8'?>
<map version="1.0.1">
  <node TEXT="宿舍空调自动关机｜四周｜AI设计实现＋人工实测" LINK="宿舍空调项目-四周实施计划书-v4.0.html">
    <node TEXT="分工原则" COLOR="#2457a7" POSITION="left">
      <node TEXT="AI主责" FOLDED="true">
        <node TEXT="资料/选型/计算/电路/引脚/接线/安装图" />
        <node TEXT="EG/ESP代码、编译、电脑测试、日志分析" />
        <node TEXT="操作卡、报告、讲稿与交付包" />
      </node>
      <node TEXT="人工必做" FOLDED="true">
        <node TEXT="H：实物信息、采购、接线焊接、测量、安装" />
        <node TEXT="S：连接设备、必要电脑操作、原始日志、逐次对账" />
        <node TEXT="H＋S：真实通行、按遥控器、观察空调、拍摄" />
      </node>
      <node TEXT="协作难点" FOLDED="true">
        <node TEXT="陌生空调协议：AI分析＋人工采样和实机验证" />
        <node TEXT="门口光学覆盖：AI设计调整＋人工走动和测量" />
        <node TEXT="工具能直接访问板卡时，下载和日志也优先交AI" />
      </node>
    </node>
    <node TEXT="W1／A1＋A2：真实OFF" COLOR="#d97706" POSITION="right">
      <node TEXT="AI交付" FOLDED="true">
        <node TEXT="板卡资料、BOM、供电/引脚/驱动图、操作卡" />
        <node TEXT="ESP实际编译，接收/发射程序，捕获分析" />
      </node>
      <node TEXT="人工动作" FOLDED="true">
        <node TEXT="D1～3：量门宽、登记型号、借工具、连接两板" />
        <node TEXT="D4～7：接收OFF、搭驱动、观察真实空调" />
      </node>
      <node TEXT="G1" FOLDED="true">
        <node TEXT="开机能关、已关不打开、其他原设置能关" />
        <node TEXT="未知协议不能承诺轻易一次完成" />
      </node>
    </node>
    <node TEXT="W2／A3：门口与人数" COLOR="#059669" POSITION="right">
      <node TEXT="AI交付" FOLDED="true">
        <node TEXT="输入适配、支架图、采集/计数/校准程序" />
        <node TEXT="轨迹回放、异常处理、学习保存流程" />
      </node>
      <node TEXT="人工动作" FOLDED="true">
        <node TEXT="高约1m、前后间距先取20cm，按现场调" />
        <node TEXT="深浅衣服和两侧/中间；空开关门20次" />
        <node TEXT="100次单人进出逐次对账，失败修复重测" />
      </node>
      <node TEXT="G2" FOLDED="true">
        <node TEXT="正常方向和累计正确；歧义停止自动" />
        <node TEXT="启动未知，人工校准，不把无动作当无人" />
      </node>
    </node>
    <node TEXT="W3／A4：真实15分钟" COLOR="#7c3aed" POSITION="right">
      <node TEXT="AI交付" FOLDED="true">
        <node TEXT="UART/CRC/会话/执行握手、OLED与按键" />
        <node TEXT="900秒非阻塞计时、取消、一次性执行" />
      </node>
      <node TEXT="人工动作" FOLDED="true">
        <node TEXT="连接双板、屏幕、双刀暂停；固定最终线长" />
        <node TEXT="完整等待900秒并观察空调" />
        <node TEXT="899秒附近进入/开门/暂停；重启和断线" />
      </node>
      <node TEXT="G3" FOLDED="true">
        <node TEXT="有效零人数＋门关稳定＋已验证配置＋通信正常" />
        <node TEXT="真实检测→计时→发射→真实关机连通" />
      </node>
    </node>
    <node TEXT="W4／A5：故障与交付" COLOR="#db2777" POSITION="right">
      <node TEXT="AI交付" FOLDED="true">
        <node TEXT="分析日夜/离线/重启数据，修复影响验收的缺陷" />
        <node TEXT="实际接线/安装图、手册、报告、兼容记录、讲稿" />
      </node>
      <node TEXT="人工动作" FOLDED="true">
        <node TEXT="检查固定和走线、有人场景与离线实测" />
        <node TEXT="拍完整15分钟视频，演示返回取消" />
        <node TEXT="第三人按文档复现" />
      </node>
      <node TEXT="G4／G5" FOLDED="true">
        <node TEXT="保留失败与成功原始证据" />
        <node TEXT="发布可复现交付包，未完成项如实标明" />
      </node>
    </node>
    <node TEXT="六模块与最低学习" COLOR="#0891b2" POSITION="left">
      <node TEXT="M0 基础" FOLDED="true">
        <node TEXT="人学：电平/共地/测量/运行日志" />
        <node TEXT="AI做：板卡核对、引脚/供电、最小程序" />
      </node>
      <node TEXT="M1 采集" FOLDED="true">
        <node TEXT="人学：触发释放、调位置、采数据" />
        <node TEXT="AI做：输入电路、中断/消抖/队列" />
      </node>
      <node TEXT="M2 人数" FOLDED="true">
        <node TEXT="人学：方向轨迹、未知、校准" />
        <node TEXT="AI做：状态机、异常、回放测试" />
      </node>
      <node TEXT="M3 计时" FOLDED="true">
        <node TEXT="人学：开始/取消条件、900秒验证" />
        <node TEXT="AI做：回绕计时、最终复核、只执行一次" />
      </node>
      <node TEXT="M4 红外" FOLDED="true">
        <node TEXT="人学：OFF与切换区别、学习与观察" />
        <node TEXT="AI做：驱动、捕获分析、保存/发射" />
      </node>
      <node TEXT="M5 联调" FOLDED="true">
        <node TEXT="人学：UART交叉、操作界面、完整日志" />
        <node TEXT="AI做：协议、显示、按钮、故障测试" />
      </node>
    </node>
    <node TEXT="连接与安装" COLOR="#475569" POSITION="left">
      <node TEXT="采集到决策" FOLDED="true">
        <node TEXT="A/B/门磁→输入适配→EG采集→计数→900秒" />
        <node TEXT="校准按键和暂停状态→EG" />
      </node>
      <node TEXT="决策到空调" FOLDED="true">
        <node TEXT="EG↔短UART↔ESP，按需转换电平" />
        <node TEXT="ESP→MOSFET/限流/LED→无线红外→空调" />
        <node TEXT="原遥控器→接收头→ESP；ESP→OLED" />
      </node>
      <node TEXT="实物位置" FOLDED="true">
        <node TEXT="A/B同在门锁侧固定支架，沿进出方向前后排" />
        <node TEXT="两板同盒在门内固定墙面，约1.3～1.5m" />
        <node TEXT="发射头先靠接收窗5～15cm，最终线长复测" />
      </node>
    </node>
    <node TEXT="边界与阶段启动" COLOR="#b45309" POSITION="left">
      <node TEXT="保留" FOLDED="true">
        <node TEXT="约100元、单人依次通行、全天本地离线" />
        <node TEXT="EG唯一自动决策，首次验证OFF后自动执行" />
        <node TEXT="暂停/异常/重启保护，不接空调市电" />
      </node>
      <node TEXT="四周后再做" FOLDED="true">
        <node TEXT="云服务器、PWA、多品牌大码库、自制PCB" />
      </node>
      <node TEXT="当前状态" FOLDED="true">
        <node TEXT="本次仅完成计划；A1～A5待用户通知" />
        <node TEXT="已有源码和此前49项电脑测试记录；实物未验收" />
        <node TEXT="当前板卡电压/精确门宽/目标协议仍待测" />
      </node>
      <node TEXT="启动方法" FOLDED="true">
        <node TEXT="发送：现在启动四周计划A__，附型号、测量、日志" />
        <node TEXT="AI交文件＋验证范围＋人工下一操作卡" />
      </node>
    </node>
  </node>
</map>