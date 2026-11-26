import {platformHint,embeddedBrowser,notificationGate,ReminderDelivery} from './phone-support.js';

const KEY='habitat.demo.notifications.v1';
const safe=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SOURCES={apple:'https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/',android:'https://support.google.com/chrome/answer/9658361?hl=zh-Hans&co=GENIE.Platform%3DAndroid',background:'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation'};
const instructions={
  ios:[['用 Safari 打开网址','如果在微信或 QQ 内，先复制网址，再粘贴到 Safari。'],['分享 → 添加到主屏幕','在分享菜单中找到“添加到主屏幕”；若有“作为 Web App 打开”，保持开启，再点“添加”。菜单位置可能随系统版本变化。'],['从桌面的“栖息”图标打开','然后回到右上角的铃铛开启提醒。系统通知需 iOS / iPadOS 16.4 或以上；添加图标本身不等于已开通知。']],
  android:[['用 Chrome 打开网址','在微信 / QQ 内请先复制链接，切换到浏览器。其他浏览器的菜单名称可能不同。'],['菜单 ⋮ → 安装或添加到主屏幕','也可能显示“安装并创建快捷方式”。如果下方出现“安装栖息”按钮，可以直接点击。'],['从手机桌面打开“栖息”','再回来开启通知并测试。若只创建了快捷方式，也能快速打开；通知能力以实际检测为准。']],
  desktop:[['用 Chrome 或 Edge 打开','桌面电脑可先体验，手机请切换上方教程。'],['地址栏安装图标，或浏览器菜单','浏览器提供安装入口时，可把“栖息”作为独立窗口打开。没有入口时仍可作为普通网页使用。'],['开启通知，发送一次测试','检查系统通知中心。电脑上的授权不会同步到手机，每个设备需要分别设置。']]
};

export class PhoneGuide {
  constructor({notify,onNotice}){
    this.notify=notify;this.onNotice=onNotice;this.platform=platformHint(navigator.userAgent,navigator.maxTouchPoints);this.selected=this.platform;
    this.embedded=embeddedBrowser(navigator.userAgent);this.display=matchMedia('(display-mode: standalone)');this.root=document.createElement('div');this.root.id='phone-layer';document.body.append(this.root);
    this.worker='loading';this.enabled=false;this.registration=null;this.installPrompt=null;this.installedEvent=false;this.error='';this.result='';this.busy=false;this.clientId=null;
    this.tag='qixi-empty-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
    try{this.enabled=localStorage.getItem(KEY)==='on';}catch{}
    this.delivery=new ReminderDelivery({show:(title,body)=>this.show(title,body,'demo'),clear:()=>this.clear(),onError:()=>{this.error='系统未能显示演示通知，页面内提醒仍正常。请查看通知权限，或换用支持的浏览器。';this.render();}});
    addEventListener('beforeinstallprompt',event=>{event.preventDefault();this.installPrompt=event;this.render();});
    addEventListener('appinstalled',()=>{this.installPrompt=null;this.installedEvent=true;this.result='已完成安装。请从桌面图标重新打开。';this.render();});
    this.display.addEventListener?.('change',()=>this.render());
    addEventListener('focus',()=>this.render());
    addEventListener('online',()=>this.render());addEventListener('offline',()=>this.render());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.render();});
    navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='QIXI_OPEN_REMINDER')this.onNotice(event.data.kind);});
    this.root.addEventListener('click',event=>{const b=event.target.closest('[data-phone]');if(!b||b.disabled)return;this.action(b.dataset.phone,b.dataset.value);});
    this.startWorker();
  }
  standalone(){return this.display.matches||navigator.standalone===true;}
  permission(){return 'Notification' in window?Notification.permission:'unsupported';}
  gate(){return notificationGate({secure:isSecureContext,embedded:this.embedded,ios:this.platform==='ios',standalone:this.standalone(),supported:'Notification' in window&&'serviceWorker' in navigator&&'ServiceWorkerRegistration' in window&&'showNotification' in ServiceWorkerRegistration.prototype,permission:this.permission(),worker:this.worker});}
  async startWorker(){
    if(!isSecureContext||!('serviceWorker' in navigator)){this.worker='failed';this.render();return;}
    let deadline;
    try{
      await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      this.registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('worker timeout')),12000);})]);
      this.worker='ready';
      const channel=new MessageChannel();channel.port1.onmessage=e=>{this.clientId=e.data?.clientId;channel.port1.close();};
      this.registration.active?.postMessage({type:'QIXI_CLIENT_ID'},[channel.port2]);
    }catch{this.worker='failed';}
    finally{clearTimeout(deadline);this.render();}
  }
  open(){
    if(this.root.querySelector('dialog'))return;
    this.trigger=document.activeElement;
    this.root.innerHTML='<dialog class="modal phone-modal" aria-labelledby="phone-title"><div class="phone-content"></div></dialog>';
    const dialog=this.root.querySelector('dialog');dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    this.render();dialog.showModal();
  }
  close(){this.root.querySelector('dialog')?.close();this.root.replaceChildren();if(this.trigger?.isConnected)this.trigger.focus({preventScroll:true});else document.querySelector('[data-action="phone-guide"]')?.focus({preventScroll:true});}
  render(){
    const content=this.root.querySelector('.phone-content');if(!content)return;
    const focus=document.activeElement?.closest('[data-phone]');const key=focus?{action:focus.dataset.phone,value:focus.dataset.value}:null;
    const expanded=[...content.querySelectorAll('details[open]')].map(d=>d.dataset.faq);
    const scroll=this.root.querySelector('dialog').scrollTop,gate=this.gate(),standalone=this.standalone(),allowed=gate.code==='ready',ask=gate.code==='ask';
    const status=allowed?(this.enabled?'演示通知已开启':'通知已授权 · 演示提醒未开启'):gate.title;
    const installButton=!standalone&&!this.installedEvent&&this.installPrompt?'<button class="btn primary" data-phone="install">安装栖息</button>':'';
    content.innerHTML=`<div class="dialog-top"><div><span class="eyebrow">QIXI / ON YOUR PHONE</span><h2 id="phone-title">桌面与提醒</h2></div><button class="icon-btn" data-phone="close" aria-label="关闭桌面与提醒">×</button></div>
      <div class="phone-hero"><div><span class="phone-kicker">让栖息，离你近一点。</span><h3>桌面一点，就回到宿舍。</h3><p>不用下载应用商店安装包。<br>添加图标，再决定是否开启系统提醒。</p><div class="phone-status"><span>${standalone?'✓ 独立窗口已打开':this.installedEvent?'✓ 已安装，请从图标打开':'浏览器内访问'}</span><span>${navigator.onLine?'在线':'离线演示'}</span></div></div><div class="homescreen-art" role="img" aria-label="手机桌面上的栖息图标示意"><div class="phone-island"></div><span class="mock-time">09:41</span><div class="mock-apps"><i></i><i></i><i></i><div><img src="./icons/icon-192.png" alt=""><small>栖息</small></div></div><div class="mock-dock"><i></i><i></i><i></i></div></div></div>
      <section class="phone-section"><div class="phone-section-title"><span>01</span><div><h3>放到手机桌面</h3><p>按你的设备选择教程</p></div>${standalone?'<b class="phone-done">已从独立窗口打开</b>':''}</div>
      <div class="platform-tabs" role="group" aria-label="选择设备教程">${[['ios','iPhone / iPad'],['android','安卓手机'],['desktop','电脑']].map(([id,label])=>`<button data-phone="platform" data-value="${id}" aria-pressed="${this.selected===id}" class="${this.selected===id?'selected':''}">${label}</button>`).join('')}</div>
      ${this.embedded?'<div class="phone-callout amber">检测到应用内浏览器：请先复制网址，使用 Safari / Chrome 打开后再安装或授权。</div>':''}
      <ol class="install-steps">${instructions[this.selected].map(([title,body])=>`<li><strong>${title}</strong><p>${body}</p></li>`).join('')}</ol>
      <div class="phone-actions">${installButton}<button class="btn secondary" data-phone="copy">复制网站链接</button><button class="btn text-button" data-phone="refresh">刷新检测</button></div>
      ${!standalone&&!this.installPrompt?'<p class="phone-small">未出现安装按钮时，按上面的浏览器菜单步骤操作。网页无法自动替你添加桌面图标。</p>':''}
      <div class="copy-fallback" hidden><label>长按或全选复制<input readonly aria-label="网站链接" value="${safe(this.siteURL())}"></label></div></section>
      <section class="phone-section"><div class="phone-section-title"><span>02</span><div><h3>设置你的提醒</h3><p>你主动开启，我们才申请权限</p></div></div>
      <div class="reminder-options"><div><i class="reminder-dot on"></i><div><strong>页面内优先提醒 <b>已支持</b></strong><p>网页打开时显示。可提前确认，未确认仍到点自动执行。</p></div></div><div><i class="reminder-dot ${allowed&&this.enabled?'on':''}"></i><div><strong>系统通知 <b>可测试</b></strong><p>允许后，在本页仍运行时发送空房演示通知。点击通知只返回页面，不直接关机。</p></div></div><div><i class="reminder-dot pending"></i><div><strong>锁屏 / 关闭后远程提醒 <b>待接入</b></strong><p>后台推送服务尚未接入。添加桌面、授权成功或测试成功，都不代表已支持后台宿舍提醒。</p></div></div></div>
      <div class="permission-panel"><div><span class="permission-dot ${allowed?'on':''}"></span><strong>${safe(status)}</strong></div><p>${safe(gate.detail)}</p><div class="phone-actions"><button class="btn primary" data-phone="enable" ${(!allowed&&!ask)||this.busy?'disabled':''}>${this.busy?'正在处理…':allowed&&this.enabled?'关闭演示通知':allowed?'开启演示通知':'允许演示通知'}</button><button class="btn secondary" data-phone="test" ${!allowed||!this.enabled||this.busy?'disabled':''}>发送测试通知</button></div><p class="phone-small">${this.result?safe(this.result):'测试只检查此设备的通知显示，不创建空调任务。'}</p>${this.error?`<p class="phone-error" role="alert">${safe(this.error)}</p>`:''}</div>
      <div class="phone-callout">网页中的“最高优先级”只覆盖本页弹窗。系统通知不能强制突破静音、专注模式或省电限制；锁屏后网页计时可能暂停，真实计时应由设备执行。</div></section>
      <section class="phone-faq"><h3>遇到问题时</h3><details data-faq="missing"><summary>点了允许，为什么没有弹出通知？</summary><p>先点“发送测试通知”，再检查手机通知中心。系统可能把通知静默收纳；检查栖息 / 浏览器的通知、横幅、锁屏和专注模式设置。显示“已提交”只表示浏览器接受请求，不证明你已看到横幅。</p></details><details data-faq="denied"><summary>之前点了“不允许”，怎么恢复？</summary><p>网页不会反复弹授权框。iPhone 桌面应用可到“设置 → 通知 → 栖息”检查；Android 可检查浏览器的网站通知权限及系统的应用通知设置。不同系统路径可能不同，改好后回到本页点“刷新检测”。</p></details><details data-faq="background"><summary>想锁屏、关掉网页后也收到提醒？</summary><p>需要后续连接宿舍设备和后台推送服务。由设备上报空房事件，服务端推送给已订阅的手机；点通知回到页面查看最新状态。自动关机仍由主控计时，不能等手机收到通知才执行。手机离线或系统限制可能让提醒延迟。</p></details><details data-faq="offline"><summary>添加后没网还能用吗？</summary><p>首次联网加载并完成缓存后，可以离线打开本演示。离线看到的是浏览器模拟数据，不是宿舍实时状态；系统清理缓存后需要再次联网。刷新会重置模拟人数，房型与时长按本浏览器保存情况恢复。</p></details></section>
      <div class="phone-sources">操作参考 · <a href="${SOURCES.apple}" target="_blank" rel="noopener noreferrer">Apple / WebKit</a><a href="${SOURCES.android}" target="_blank" rel="noopener noreferrer">Chrome 帮助</a><a href="${SOURCES.background}" target="_blank" rel="noopener noreferrer">后台提醒说明</a><small>按当前设备实际支持情况显示 · 2026-11-06 核对</small></div><button class="btn secondary full phone-finish" data-phone="close">完成，返回宿舍</button>`;
    for(const id of expanded)content.querySelector(`[data-faq="${id}"]`)?.setAttribute('open','');
    if(key){const candidate=[...content.querySelectorAll('[data-phone]')].find(b=>b.dataset.phone===key.action&&b.dataset.value===key.value);candidate?.focus({preventScroll:true});}
    this.root.querySelector('dialog').scrollTop=scroll;
  }
  siteURL(){const u=new URL('./',location.href);u.hash='';u.search='';return u.href;}
  async action(action,value){
    if(action==='close'){this.close();return;}
    if(action==='platform'){this.selected=value in instructions?value:this.platform;this.render();return;}
    if(action==='refresh'){if(this.worker==='failed'){this.worker='loading';this.startWorker();}this.render();this.notify('已重新检查当前浏览器与通知权限');return;}
    if(action==='copy'){
      try{await navigator.clipboard.writeText(this.siteURL());this.notify('网站链接已复制，可粘贴到手机浏览器');}
      catch{const fallback=this.root.querySelector('.copy-fallback');if(fallback){fallback.hidden=false;fallback.querySelector('input').select();}this.notify('请长按或全选下方网址进行复制');}return;
    }
    if(action==='install'){
      if(!this.installPrompt){this.notify('请按浏览器菜单步骤添加到桌面');return;}
      const event=this.installPrompt;this.installPrompt=null;
      try{await event.prompt();const result=await event.userChoice;this.result=result.outcome==='accepted'?'已接受安装，请等待系统完成，再从桌面图标打开。':'这次未安装，之后仍可通过浏览器菜单添加。';}
      catch{this.result='浏览器未完成安装，请使用上面的菜单步骤。';}this.render();return;
    }
    if(action==='enable'){
      if(this.enabled&&this.gate().code==='ready'){this.enabled=false;this.saveEnabled();this.delivery.sync({},false);this.result='演示通知已关闭，页面内优先提醒继续保留。';this.render();return;}
      const gate=this.gate();if(!['ask','ready'].includes(gate.code)){this.notify(gate.detail);return;}
      this.error='';
      // Call permission API in the click gesture, before any async worker wait.
      let request;
      try{request=this.permission()==='granted'?Promise.resolve('granted'):Notification.requestPermission();}
      catch{this.error='浏览器没有接受权限请求，请检查系统或浏览器设置。';this.render();return;}
      this.busy=true;this.render();
      try{this.enabled=(await request)==='granted';this.saveEnabled();this.result=this.enabled?'演示通知已开启。请发送一次测试，确认手机如何展示。':'没有开启系统通知，页面内提醒仍可正常使用。';}
      catch{this.error='未能申请通知权限，请检查浏览器与系统设置。';}
      finally{this.busy=false;this.render();}return;
    }
    if(action==='test'){
      if(this.gate().code!=='ready'||!this.enabled)return;
      this.busy=true;this.error='';this.render();
      try{await this.show('栖息 · 通知测试','如果你看到了这条通知，当前设备可以展示提醒。此测试不操作空调，也不代表后台推送已接入。','test');this.result='测试已提交给系统，请查看通知中心或横幅。未看到时展开下方排查说明。';}
      catch{this.error='系统未能显示测试通知。请检查通知设置或更新浏览器后重试。';}
      finally{this.busy=false;this.render();}
    }
  }
  saveEnabled(){try{localStorage.setItem(KEY,this.enabled?'on':'off');}catch{this.notify('通知偏好仅在本次打开期间生效');}}
  async show(title,body,kind){
    if(this.gate().code!=='ready'||!this.registration||!this.enabled)throw new Error('notifications not ready');
    await this.registration.showNotification(title,{body,icon:'./icons/icon-192.png',tag:kind==='test'?'qixi-notification-test':this.tag,data:{kind,clientId:this.clientId},requireInteraction:false});
  }
  async clear(){if(!this.registration)return;const notifications=await this.registration.getNotifications({tag:this.tag});notifications.forEach(n=>n.close());}
  sync(state){this.delivery.sync(state,this.enabled&&this.gate().code==='ready');}
}
