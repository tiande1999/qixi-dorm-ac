// Capability checks are authoritative; user-agent hints only select instructions.
export function platformHint(ua='',touchPoints=0){
  if(/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&touchPoints>1))return 'ios';
  return /Android/i.test(ua)?'android':'desktop';
}
export function embeddedBrowser(ua=''){return /MicroMessenger|\bQQ\/|Instagram|FBAN|FBAV|; wv\)/i.test(ua);}
export function notificationGate({secure,embedded,ios,standalone,supported,permission,worker}){
  if(!secure)return {code:'insecure',title:'需要安全连接',detail:'请使用 HTTPS 网站地址；本机 localhost 调试除外。'};
  if(embedded)return {code:'embedded',title:'请在系统浏览器打开',detail:'当前可能是微信 / QQ 等应用内浏览器。先复制网址，用 Safari 或 Chrome 打开。'};
  if(ios&&!standalone)return {code:'install-first',title:'先添加到主屏幕',detail:'iPhone / iPad 请先添加到主屏幕，再从“栖息”图标打开。系统通知需要 iOS / iPadOS 16.4 或以上及浏览器支持。'};
  if(!supported)return {code:'unsupported',title:'当前浏览器不支持系统通知',detail:'可以继续使用页面内提醒；也可更新系统，换用支持通知的浏览器再试。'};
  if(permission==='denied')return {code:'denied',title:'通知权限已被关闭',detail:'请在浏览器的网站权限或手机系统的通知设置中允许“栖息” / 当前浏览器，再回到此页刷新状态。网页不能代你解除拦截。'};
  if(worker==='failed')return {code:'worker-failed',title:'提醒组件未就绪',detail:'页面内提醒仍可使用。请联网刷新网页后重试；隐私模式或浏览器限制可能影响此功能。'};
  if(worker!=='ready')return {code:'loading',title:'正在准备提醒组件',detail:'通常只需几秒。若一直未就绪，请联网刷新页面。'};
  if(permission==='granted')return {code:'ready',title:'系统通知权限已允许',detail:'可开启演示通知并发送测试。横幅、声音与锁屏展示仍由手机的通知设置决定。'};
  return {code:'ask',title:'等待你开启通知',detail:'点击按钮后才会申请系统权限。拒绝或暂不允许，都不会影响页面内提醒。'};
}
export function reminderEpisode(s){
  return s.phase==='countdown'&&s.emptyId&&s.start!==null&&s.remaining>0&&s.count===0&&s.trusted&&s.door&&!s.paused&&s.eg&&s.esp&&s.paired&&!s.learning?s.emptyId:null;
}
// A notification only opens the app. It never grants permission to send OFF.
export class ReminderDelivery {
  constructor({show,clear,onError=()=>{}}){this.show=show;this.clear=clear;this.onError=onError;this.current=null;this.seen=null;this.generation=0;}
  sync(s,enabled){
    const episode=enabled?reminderEpisode(s):null;
    if(episode===this.current)return;
    this.current=episode;const generation=++this.generation;
    const shouldShow=episode&&this.seen!==episode;
    if(shouldShow)this.seen=episode;
    const body=`提醒发出时剩余 ${Math.ceil(s.remaining/60)} 分钟。可回到页面提前确认；未确认则按模拟规则到点执行。`;
    this.pending=(this.pending||Promise.resolve()).catch(()=>{}).then(async()=>{
      await this.clear();
      if(shouldShow&&generation===this.generation)await this.show('栖息 · 模拟空房提醒',body);
    })
      .then(async()=>{if(generation!==this.generation)await this.clear();})
      .catch(error=>{if(generation===this.generation)this.onError(error);});
  }
}
