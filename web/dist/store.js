// Browser-only simulator. No network, serial port or real device commands.
import {validSettings,DEFAULT_PREFERENCES} from './preferences.js';
export const SCENARIOS = [
  {id:'normal',name:'有人在寝',desc:'体验正常进出与人数变化',icon:'users'},
  {id:'empty',name:'最后一人离开',desc:'按预设时间等待，可提前确认关机',icon:'exit'},
  {id:'near',name:'即将自动关机',desc:'剩余 10 秒，看完整执行过程',icon:'timer'},
  {id:'confirm',name:'提前确认关机',desc:'剩余 1 分钟；不确认也会到点关机',icon:'check'},
  {id:'ambiguous',name:'通行出现歧义',desc:'人数不可信，需要重新校准',icon:'alert'},
  {id:'offline',name:'主控设备离线',desc:'停止推演执行，提示状态过期',icon:'wifi'},
  {id:'failure',name:'关机执行失败',desc:'模拟发射器故障，查看处理建议',icon:'alert'},
  {id:'timeout',name:'未收到反馈',desc:'已发出指令，空调状态仍未知',icon:'clock'},
  {id:'expired',name:'执行许可过期',desc:'临时执行许可失效，不重放旧命令',icon:'clock'},
];
const copy = o => JSON.parse(JSON.stringify(o));
export class DemoStore {
  constructor(settings=DEFAULT_PREFERENCES){this.listeners=new Set();this.settings=validSettings(settings)?{roomCapacity:settings.roomCapacity,waitMinutes:settings.waitMinutes}:{roomCapacity:4,waitMinutes:15};this.runId=0;this.episodeSeq=0;this.reset('normal',false);}
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  emit(){for(const f of this.listeners)f(this.snapshot());}
  snapshot(){return copy(this.s);}
  log(title,detail='',type='system',level='info'){
    this.s.logs.unshift({id:++this.s.logSeq,time:this.s.time,title,detail,type,level});
    this.s.logs=this.s.logs.slice(0,250);
  }
  reset(scenario='normal',notify=true){
    this.runId++;this.episodeSeq=0;
    this.s={...this.settings,delaySeconds:this.settings.waitMinutes*60,emptyId:null,time:16*3600+42*60,scenario,count:3,trusted:true,reason:'',door:true,doorSince:0,paused:false,mode:'hybrid',phase:'occupied',start:null,remaining:null,episodeDone:false,
      eg:true,esp:true,cloud:true,feedback:true,paired:true,profile:'QX-OFF-001',ac:'running',speed:1,playing:true,outcome:'success',command:null,commandSeq:0,session:1,revision:0,
      learning:null,logs:[],logSeq:0,passages:[],dayIn:12,dayOut:9,trace:null,notice:'',member:'林同学',members:['林同学','陈同学','周同学','许同学','吴同学','赵同学'].slice(0,this.settings.roomCapacity)};
    this.s.doorSince=this.s.time-20;
    this.log('演示环境已就绪','6号楼 608 · 全部为模拟数据');
    this.s.passages=[{id:1,time:this.s.time-120,direction:'enter',count:3},{id:2,time:this.s.time-410,direction:'leave',count:2},{id:3,time:this.s.time-680,direction:'enter',count:3},{id:4,time:this.s.time-1120,direction:'enter',count:2}];
    if(scenario==='normal')for(const p of this.s.passages.slice(0,3))this.s.logs.push({id:++this.s.logSeq,time:p.time,title:p.direction==='enter'?'一位同学进入':'一位同学离开',detail:'模拟通行 · 当前记录 '+p.count+' 人',type:'passage',level:'info'});
    if(['empty','near','confirm','failure','timeout','expired'].includes(scenario)){
      this.s.count=0;this.s.start=this.s.time;this.s.phase='countdown';this.s.remaining=this.s.delaySeconds;this.s.emptyId=this.runId+'-'+(++this.episodeSeq);
      if(scenario==='empty'){this.s.doorSince=this.s.time;this.s.start=null;this.s.phase='settling';this.log('最后一位同学离开','人数 1 → 0；等待门关稳定 2 秒','passage');}
      if(['near','failure','timeout'].includes(scenario)){this.s.start=this.s.time-(this.s.delaySeconds-10);this.s.remaining=10;}
      if(scenario==='failure')this.s.outcome='failure';
      if(scenario==='timeout')this.s.outcome='timeout';
      if(scenario==='confirm'){this.s.start=this.s.time-(this.s.delaySeconds-60);this.s.remaining=60;}
      if(scenario==='expired'){this.createCommand();this.finish('expired','执行许可已过期','2 秒临时执行许可失效，没有发出红外指令');}
    }
    if(scenario==='ambiguous'){this.s.trusted=false;this.s.reason='两路同时触发，无法判断进出方向';this.s.phase='untrusted';this.log('通行方向不明确',this.s.reason,'alert','warning');}
    if(scenario==='offline'){this.s.eg=false;this.s.phase='offline';this.log('主控连接中断','人数为断连前记录，当前状态无法确认','device','warning');}
    this.s.notice='已载入「'+(SCENARIOS.find(x=>x.id===scenario)?.name||'有人在寝')+'」';
    if(notify)this.emit();
  }
  eligible(){const s=this.s;return s.eg&&s.esp&&s.paired&&s.count===0&&s.trusted&&s.door&&!s.paused&&!s.learning;}
  canConfirm(){const s=this.s;return this.eligible()&&s.phase==='countdown'&&s.start!==null&&!s.episodeDone&&s.time-s.doorSince>=2;}
  configure(settings){
    if(!validSettings(settings)){this.s.notice='请选择 4 / 6 人寝，等待时间需为 1～60 的整数分钟';return false;}
    if(this.s.command&&['executing','sent'].includes(this.s.command.status)){this.s.notice='请等待当前发射完成，再修改设置';return false;}
    this.cancelPending('房间或等待时间已修改');this.settings={roomCapacity:settings.roomCapacity,waitMinutes:settings.waitMinutes};Object.assign(this.s,this.settings,{delaySeconds:settings.waitMinutes*60});
    this.s.members=['林同学','陈同学','周同学','许同学','吴同学','赵同学'].slice(0,settings.roomCapacity);if(!this.s.members.includes(this.s.member))this.s.member=this.s.members[0];
    if(!['success','failed','unknown'].includes(this.s.phase))this.s.episodeDone=false;
    this.log('房间设置已更新',settings.roomCapacity+' 人寝 · 等待 '+settings.waitMinutes+' 分钟；有倒计时则重新开始','user');this.s.notice='设置已保存，倒计时按新时长重新判断';this.tick(0);this.emit();return true;
  }
  cancelPending(reason){const s=this.s;if(s.command&&['requested','accepted'].includes(s.command.status)){s.command.status='cancelled';s.command.reason=reason;this.log('本次关机已取消',reason,'command');}s.start=null;s.remaining=null;s.emptyId=null;s.revision++;}
  createCommand(trigger='deadline'){const s=this.s;s.command={id:'DEMO-'+s.session+'-'+String(++s.commandSeq).padStart(3,'0'),trigger,session:s.session,profile:s.profile,revision:s.revision,status:'requested',created:s.time,expires:s.time+2,stageAt:s.time+.4};this.log('发起模拟关机请求',s.command.id+' · '+(trigger==='manual'?'成员提前确认':'预设等待时间已到')+' · 复核人数、门磁和运行状态','command');}
  finish(status,title,detail){const s=this.s;if(s.command){s.command.status=status;s.command.reason=detail;}s.episodeDone=true;s.phase=status;s.start=null;s.remaining=null;this.log(title,detail,'command',['failed','expired','unknown'].includes(status)?'warning':'info');}
  tick(dt){
    const s=this.s;s.time+=dt;
    if(s.trace&&s.time>s.trace.until)s.trace=null;
    const c=s.command;
    if(c&&['requested','accepted'].includes(c.status)&&(!this.eligible()||c.session!==s.session||c.revision!==s.revision)){this.cancelPending('条件已变化，许可作废');}
    if(c&&['requested','accepted','executing','sent'].includes(c.status)){
      if(s.time<c.stageAt)return;
      if(['requested','accepted'].includes(c.status)&&s.time>=c.expires){this.finish('expired','执行许可过期','临时执行标识失效，没有发射');return;}
      if(c.status==='requested'){c.status='accepted';s.phase='accepted';c.stageAt=s.time+.4;this.log('模拟执行器已接受','许可有效期 2 秒，仅可使用一次','command');return;}
      if(c.status==='accepted'){c.status='executing';s.phase='executing';s.episodeDone=true;c.stageAt=s.time+.7;this.log('正在模拟发送 OFF','已消耗执行标识；发射开始后无法撤回','command');return;}
      if(c.status==='executing'){
        if(s.outcome==='failure'){this.finish('failed','模拟发射失败','发射器未完成输出，本次不自动重试');return;}
        c.status='sent';s.phase='sent';c.stageAt=s.time+(s.outcome==='timeout'||!s.feedback?5:1);this.log('关机指令已发送（模拟）','等待模拟观察结果；发送不等于确认关机','command');return;
      }
      if(s.outcome==='timeout'||!s.feedback){this.finish('unknown','未收到模拟反馈','指令已发送，空调状态未知，不自动补发');s.ac='unknown';}
      else {s.ac='standby';this.finish('success','模拟空调已进入待机','由演示观察器生成结果，不是真实硬件回执');}
      return;
    }
    if(!s.eg){s.phase='offline';return;}
    if(s.learning){s.phase='learning';return;}
    if(!s.trusted||s.count===null){s.phase=s.count===null?'unknown-count':'untrusted';return;}
    if(s.paused){s.phase='paused';return;}
    if(s.count>0){s.phase='occupied';return;}
    if(!s.door){s.phase='door-open';return;}
    if(!s.esp||!s.paired){s.phase='not-ready';return;}
    if(s.episodeDone)return;
    if(s.time-s.doorSince<2){s.phase='settling';return;}
    if(s.start===null){s.start=s.time;s.remaining=s.delaySeconds;s.emptyId=this.runId+'-'+(++this.episodeSeq);this.log('空房倒计时开始','人数可信、门已关稳，等待 '+s.waitMinutes+' 分钟；期间可提前确认关机','system');}
    s.remaining=Math.max(0,Math.ceil(s.delaySeconds-(s.time-s.start)));s.phase='countdown';
    if(s.remaining===0){this.createCommand('deadline');s.phase='requested';}
  }
  advance(seconds){if(!Number.isFinite(seconds)||seconds<0)return;let remain=Math.min(seconds,3600);while(remain>0){const dt=Math.min(.2,remain);this.tick(dt);remain-=dt;}this.emit();}
  act(action,value){
    const s=this.s;s.notice='';
    const say=t=>{s.notice=t;};
    if(action==='scenario'){this.reset(value);return;}
    if(action==='enter'||action==='leave'){
      if(!s.eg)say('主控离线，先恢复设备连接');
      else if(s.learning)say('正在学习，请先完成或退出学习');
      else{
        this.cancelPending('检测到新的通行');s.episodeDone=false;
        const d=action==='enter'?1:-1;
        if(s.count===0&&d<0){s.trusted=false;s.reason='人数已为 0，却又检测到离开';this.log('人数记录不一致',s.reason,'alert','warning');say('人数出现矛盾，请先校准');}
        else {if(s.count!==null)s.count+=d;s[action==='enter'?'dayIn':'dayOut']++;s.passages.unshift({id:s.logSeq+10,time:s.time,direction:action,count:s.count});s.passages=s.passages.slice(0,80);this.log(action==='enter'?'一位同学进入':'一位同学离开','当前记录 '+(s.count??'未知')+' 人','passage');s.trace={direction:action,until:s.time+3};say(action==='enter'?'已模拟进入，倒计时已取消':'已模拟离开');}
        s.door=true;s.doorSince=s.time;
      }
    }else if(action==='calibrate'){
      if(!s.eg)say('主控离线，无法提交校准');
      else if(!Number.isInteger(value)||value<0||value>8)say('请输入 0～8 的整数人数');
      else {this.cancelPending('人工校准人数');s.count=value;s.trusted=true;s.reason='';s.episodeDone=false;s.doorSince=s.time;this.log('人数已人工校准',s.member+' 将人数校准为 '+value+' 人','user');say('已校准为 '+value+' 人，重新判断空房条件');}
    }else if(action==='pause'){
      if(s.command&&['executing','sent'].includes(s.command.status)){say('暂停后续自动任务；已经开始的发射无法撤回');}
      else say(s.paused?'已恢复自动规则，重新计时':'已暂停，本次倒计时已取消');
      this.cancelPending('成员暂停');s.paused=!s.paused;if(!s.paused)s.episodeDone=false;this.log(s.paused?'成员暂停自动关机':'成员恢复自动规则',s.member,'user');
    }else if(action==='cancel'){
      if(s.command&&['executing','sent'].includes(s.command.status))say('红外已经开始发送，无法撤回');
      else{this.cancelPending('成员取消 / 否决');s.paused=true;this.log('成员否决本次关机',s.member+' · 恢复后重新计时','user');say('已取消并暂停，等待手动恢复');}
    }else if(action==='confirm'){
      if(!this.canConfirm())say('当前条件已变化，无法提前关机');
      else {this.createCommand('manual');s.phase='requested';this.log('成员提前确认模拟关机',s.member+' · '+s.command.id,'user');say('已提前确认，正在模拟执行');}
    }else if(action==='door'){this.cancelPending('门状态变化');s.door=!s.door;s.doorSince=s.time;s.episodeDone=false;this.log(s.door?'门已关闭':'门已打开','模拟门磁事件','device');say(s.door?'门已关，稳定后重新计时':'门已打开，倒计时取消');
    }else if(action==='ambiguous'){this.cancelPending('歧义通行');s.trusted=false;s.reason='两路同时触发，进出方向不明确';this.log('通行出现歧义',s.reason,'alert','warning');say('人数已标记不可信，自动关机停止');
    }else if(action==='eg'||action==='esp'){
      this.cancelPending('设备连接变化');s[action]=!s[action];s.episodeDone=false;if(action==='eg'&&s.eg){s.count=null;s.trusted=false;s.reason='重新连接后，请核对实际人数';}this.log((action==='eg'?'主控':'红外执行器')+(s[action]?'已恢复连接':'已离线'),'模拟设备连接变化','device',s[action]?'info':'warning');say('设备状态已更新');
    }else if(action==='reboot'){
      this.cancelPending('主控重启');s.session++;s.command=null;s.eg=true;s.count=null;s.trusted=false;s.reason='重启后人数未知，需要校准';s.episodeDone=false;s.learning=null;this.log('主控已模拟重启','旧会话已作废，人数未知','device','warning');say('已重启，请重新校准人数');
    }else if(action==='cloud'){s.cloud=!s.cloud;this.log(s.cloud?'平台网络已恢复':'平台网络已断开','仅模拟网络；本地计数与规则继续推演','device');say(s.cloud?'模拟网络已恢复':'已断开模拟网络，本地规则继续');
    }else if(action==='feedback'){s.feedback=!s.feedback;this.log('模拟观察器设置已更改',s.feedback?'开启模拟结果':'关闭后，只能看到发送结果','user');say('模拟反馈已'+(s.feedback?'开启':'关闭'));
    }else if(action==='duplicate'){if(!s.command)say('先运行一次关机流程，再测试重复命令');else{this.log('重复命令已拒绝',s.command.id+' · 未再次发射','command','warning');say('模拟去重成功，没有再次发送');}
    }else if(action==='learning-start'){
      if(!s.eg||!s.esp)say('请先恢复两台设备连接');
      else if(s.command&&['executing','sent'].includes(s.command.status))say('请等待本次执行结束再学习');
      else{this.cancelPending('开始红外学习');s.paired=false;s.learning={step:0,failed:false};s.trusted=false;s.reason='学习完成后需重新校准人数';this.log('开始模拟红外学习','旧配置不再作为已验证配置','user');say('已进入学习向导');}
    }else if(action==='learning-next'){
      if(!s.learning)say('请先开始学习');
      else if(!s.eg||!s.esp)say('设备离线，不能继续学习');
      else if(s.learning.failed)say('请重试当前步骤');
      else if(s.learning.step<5){s.learning.step++;this.log('学习步骤已完成','第 '+s.learning.step+' 步 · 模拟观察','learning');say('模拟结果已记录');}
      else {s.learning=null;s.paired=true;s.profile='QX-OFF-002';s.count=null;s.trusted=false;s.reason='学习完成，请校准实际人数';s.command=null;s.episodeDone=false;this.log('模拟关机配置已保存',s.profile+' · 仅演示验证；人数需重新校准','learning');say('配置已保存，请校准人数');}
    }else if(action==='learning-fail'){if(s.learning){s.learning.failed=true;this.log('学习验证未通过','请检查捕获与独立 OFF；未保存为有效配置','learning','warning');say('本步骤未通过，自动执行仍停用');}}
    else if(action==='learning-retry'){if(s.learning){s.learning.failed=false;say('已准备重试当前步骤');}}
    else if(action==='learning-abort'){s.learning=null;s.paired=false;s.count=null;s.trusted=false;s.reason='学习已退出，需重新学习和校准';this.log('退出红外学习','未保存未经验证的配置','learning');say('已退出，配置仍未验证');}
    else if(action==='speed'){if([1,15,60].includes(Number(value)))s.speed=Number(value);say('模拟时钟设为 '+s.speed+' 倍');}
    else if(action==='play'){s.playing=!s.playing;say(s.playing?'模拟时钟继续':'模拟时钟已暂停');}
    else if(action==='member'){if(s.members.includes(value)){s.member=value;say('当前体验身份：'+value);}}
    this.tick(0);this.emit();
  }
}
export const phaseInfo=s=>({occupied:['有人在寝','空调保持当前状态','green'],countdown:['空房倒计时','可提前确认；满 '+s.waitMinutes+' 分钟自动关机','green'],settling:['等待门关稳定','门关稳定 2 秒后开始计时','amber'],requested:['正在请求关机','重新检查全部执行条件','blue'],accepted:['执行器已接受','即将发送模拟 OFF','blue'],executing:['正在发送关机指令','发射已开始，无法撤回','blue'],sent:['指令已发送','正在等待模拟观察结果','blue'],success:['模拟关机完成','本次空房流程已完成','green'],failed:['模拟执行失败','本次不自动重试，请查看原因','red'],unknown:['结果暂时未知','已发送，无法确认空调是否关机','amber'],expired:['请求已过期','未执行关机，可重新开始演示','amber'],cancelled:['本次已取消','恢复后重新等待 '+s.waitMinutes+' 分钟','amber'],paused:['自动关机已暂停','恢复后重新判断空房条件','amber'],untrusted:['人数需要核对','通行出现歧义，自动关机已停止','amber'],'unknown-count':['人数未知','请先校准实际人数','amber'],offline:['主控设备离线','当前人数为最后记录，自动演示已停止','red'],'door-open':['门还开着','关门稳定后重新开始计时','amber'],'not-ready':['等待设备就绪','请检查执行器连接和关机配置','amber'],learning:['正在学习遥控器','自动关机暂停，跟随向导完成验证','blue']}[s.phase]||['状态更新中','请稍候','blue']);
