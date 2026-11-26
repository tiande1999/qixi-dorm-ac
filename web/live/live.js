import {QuecCloudAdapter, canSubmit, fresh} from './provider.js';
import {GATEWAY_PATH} from './config.js';
import {esc, formatCountdown, icon, nav, roomIllustration} from './ui.js';
import {createGuide} from './guide.js';

const provider = new QuecCloudAdapter(GATEWAY_PATH);
const app = document.getElementById('app');
const guide = createGuide();
const statusLabels = {
  unconfigured:'网关尚未配置', loading:'正在核实连接', ready:'设备在线', device_offline:'设备离线',
  stale:'数据可能已过期', offline:'浏览器已断网', authentication:'需要登录', forbidden:'设备权限不足',
  unavailable:'暂时无法连接网关', timeout:'连接超时', rate_limited:'请求过多，稍后刷新',
  signed_out:'已退出', state_changed:'设备状态已变化，请重新核实', invalid_count:'请输入有效的整数人数',
  unknown:'结果未知，请查询回执', rejected:'设备拒绝请求', failed:'执行失败',
};
const resultLabels = {submitted:'已提交网关',delivered:'平台已送达',accepted:'设备已接受',succeeded:'设备报告执行完成',...statusLabels};
const eventLabels = {shutdown_reminder:'关机提醒',count_anomaly:'计数异常',control_result:'控制回执',device_fault:'设备故障'};
const displayTime = value => value == null ? '—' : new Date(value).toLocaleString('zh-CN',{hour12:false});
let connection = GATEWAY_PATH ? 'loading' : 'unconfigured';
let eventStatus = '';
let message = '';
let receipt = null;
let busy = false;
let refreshing = false;
let signedOut = false;
let timer;
let delay = 10_000;
let countInput = '';
let modeInput = null;
let operation = 0;

function page() {
  const route = location.hash.slice(1);
  return Object.hasOwn(nav,route) ? route : 'overview';
}

const subtitles = {
  overview:'查看在寝人数、设备倒计时与模拟空调反馈。',
  activity:'核对人数和门口检测状态，再提交校准。',
  control:'管理暂停、模式和关机申请，查看设备回执。',
  devices:'核查设备连接，并将栖息添加到手机桌面。',
  logs:'查看设备上报的提醒、异常与控制结果。',
};

const countLabel = s => ['人数未知','计数有效','通行存在歧义'][s?.countStatus] ?? '人数未知';
const detectionLabel = s => ['空闲','检测中','检测异常'][s?.detection] ?? '未知';
const modeLabel = s => ['人工确认','全自动模拟'][s?.mode] ?? '未知';
const pauseLabel = s => s?.paused===true?'已暂停':s?.paused===false?'未暂停':'状态未知';
const badge = (label,color='blue') => `<span class="badge ${color}"><span class="status-dot"></span>${esc(label)}</span>`;
const action = (label,name,symbol,primary=false) => `<button class="btn ${primary?'primary':'secondary'}" type="button" data-action="${name}">${icon(symbol)}${label}</button>`;
const link = (label,route) => `<a class="btn text-button" href="#${route}">${label}</a>`;

function links(current) {
  return Object.entries(nav).map(([key,[label,symbol]])=>
    `<a class="nav-item ${key===current?'active':''}" href="#${key}" aria-label="${label}"
      ${key===current?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span></a>`).join('');
}

function panel(title, body, aside='') {
  return `<section class="card padded live-panel"><div class="section-heading"><h2>${title}</h2>${aside}</div>${body}</section>`;
}

function control(name,label,style='secondary') {
  const enabled=connection==='ready'&&!busy&&canSubmit(name,provider.session,provider.snapshot);
  const symbol={calibrate_count:'users',pause_control:'pause',resume_control:'play',set_device_mode:'settings',cancel_shutdown:'shield'}[name];
  return `<button class="btn ${style}" type="${name==='calibrate_count'?'submit':'button'}" data-control="${name}"
    ${enabled?'':'disabled'}>${icon(symbol)}${label}</button>`;
}

function actionContext(s) {
  if(connection!=='ready')return s?'同步恢复后可提交已授权的操作。':'连接设备后可提交已授权的操作。';
  if(!provider.session?.services.length)return '当前账号只有查看权限。';
  return '可用操作取决于设备状态和成员权限。';
}

function countdown(s) {
  const detail=s?.pending===true?'设备报告有待确认申请。':s?.countdown===0?'设备倒计时已归零，等待设备更新。':'空房等待固定 15 分钟，由 EG800Z 计时。';
  return `<section class="card flow-card live-countdown"><div class="flow-heading"><span class="flow-icon">${icon('timer')}</span>
    <div><h2>空房倒计时</h2><p>${detail}</p></div><span class="countdown live-value">${formatCountdown(s?.countdown)}</span></div>
    <div class="live-flow-meta"><span>${icon('clock')}${s&&connection!=='ready'?'最后一次上报':'设备上报'}</span>
    ${s?.pending===true?link('查看申请','control'):badge(pauseLabel(s),s?.paused?'amber':'blue')}</div></section>`;
}

function eventList(s,limit) {
  const events=provider.events.slice(0,limit);
  if(!events.length) {
    const title=s?'暂无设备事件':'尚无设备记录';
    const detail=eventStatus||(s?'事件查询可在记录页核查。':'连接后查看关机提醒、计数异常与控制结果。');
    return `<div class="empty live-empty">${icon('logs')}<h3>${title}</h3><p>${esc(detail)}</p></div>`;
  }
  return `<div class="event-list">${events.map(e=>`<article class="event"><span class="event-icon ${e.kind==='device_fault'||e.kind==='count_anomaly'?'amber':''}">${icon(e.kind==='shutdown_reminder'?'bell':'logs')}</span><div><strong>${eventLabels[e.kind]}</strong><p>${esc(e.message)}</p><time datetime="${new Date(e.at).toISOString()}">${displayTime(e.at)}</time></div></article>`).join('')}</div>`;
}

function deviceRow(title, detail, symbol, state, color='blue') {
  return `<div class="mini-device"><span class="device-symbol">${icon(symbol)}</span><div><strong>${title}</strong><small>${esc(detail)}</small></div>${badge(state,color)}</div>`;
}

function overview(s) {
  const reported=s?.count??'—';
  const capacity=provider.session?.device.capacity;
  const layoutKnown=capacity===4||capacity===6;
  const simLabel=s?.simState===true?'运行中':s?.simState===false?'待机':'状态未知';
  const room=roomIllustration({roomCapacity:layoutKnown?capacity:4,layoutExample:!layoutKnown,door:null,
    trusted:false,ac:s?.simState===true?'running':'unknown'});
  return `<div class="overview-grid live-overview">
    <section class="card room-card"><div class="card-top"><h2 class="tiny-label">${icon('home')}宿舍状态</h2>
      ${badge(s&&connection!=='ready'?'最后记录':countLabel(s),s?.countStatus===1&&connection==='ready'?'green':'amber')}</div>
      <div class="room-body"><div class="occupancy"><span class="muted">在寝人数</span>
      <strong class="big-count live-value">${reported}<span>人</span></strong>
      <span class="confidence ${s?.countStatus===1?'':'warning'}">${icon('shield')}${countLabel(s)}</span>
      ${link('查看人员感知','activity')}</div>
      <div class="room-visual">${room}<span class="map-caption">${layoutKnown?capacity+' 人寝户型示意':'户型示意 · 房型待同步'}</span></div></div>
      <div class="room-foot"><span>${icon('scan')}入口检测 · ${detectionLabel(s)}</span><span>${icon('clock')}${s?displayTime(s.reportedAt):'等待设备上报'}</span></div>
    </section>
    <section class="card climate-card"><div class="card-top"><h2 class="tiny-label">${icon('ac')}模拟空调</h2>${badge(simLabel,s?.simState==null?'amber':'green')}</div>
      <div class="ac-unit" aria-hidden="true"><div class="ac-body"><span class="ac-brand">QIXI</span><span class="ac-indicator ${s?.simState===true?'':'off'}"></span><div class="ac-grille"></div></div><div class="air-lines ${s?.simState===true?'':'off'}"><i></i><i></i><i></i></div></div>
      <div class="climate-copy"><h3>${s?.simState==null?'等待独立接收端反馈':'已收到模拟接收端反馈'}</h3><p>这里显示模拟台架状态。</p></div>
      <div class="climate-rule"><span>${icon('shield')}${s?.mode===null||!s?'真实关机未开放':modeLabel(s)}</span></div>
      <a class="card-link" href="#control">查看控制与回执</a>
    </section></div>
    ${countdown(s)}
    <div class="bottom-grid live-bottom"><section class="card recent-card"><div class="section-heading"><h2>设备动态</h2>${link('全部记录','logs')}</div>${eventList(s,3)}</section>
    <section class="card connection-card"><div class="section-heading"><h2>设备连接</h2>${link('设备详情','devices')}</div>
      ${deviceRow('EG800Z 主控',provider.session?.device.label || '人数统计与执行许可','device',statusLabels[connection]||'连接未知',connection==='ready'?'green':'amber')}
      ${deviceRow('飞鸢 IoT Core',s?'最近报告 '+displayTime(s.reportedAt):'认证后同步状态','wifi',GATEWAY_PATH?'已设网关':'待配置')}
    </section></div>`;
}

function calibration(s) {
  const capacity=provider.session?.device.capacity;
  return panel('人工校准',`<p>先现场核对人数，再输入准备提交的人数。${capacity?'当前允许 0–'+capacity+' 人。':''}</p>
    <form id="count-form" class="live-controls"><label for="count">在寝人数</label>
    <input type="number" id="count" min="0" max="${capacity??100}" step="1" value="${esc(countInput)}" inputmode="numeric" required>
    ${control('calibrate_count','提交校准','primary')}</form><p class="live-hint">${actionContext(s)}</p>`);
}

function activity(s) {
  return `<div class="two-col live-panels">
    ${panel('在寝人数',`<div class="activity-count"><strong>${s?.count??'—'}</strong><span>人</span>${badge(countLabel(s),s?.countStatus===1?'green':'amber')}</div>
    <p>${s?'最后同步于 '+displayTime(s.reportedAt):'尚无可信人数上报。'}</p>`)}
    ${panel('门口检测',`<div class="live-sensors"><span>${icon('scan')} HC-SR04<small>超声波测距</small></span><span>${icon('door')} KY-032<small>红外避障</small></span></div>
      <p>通行状态 · ${detectionLabel(s)}</p><p>${esc(s?.error||'暂无已上报异常。')}</p>`)}
    </div>${calibration(s)}`;
}

function controls(s) {
  const hasTask = s?.currentTask && s.currentTask.expiresAt>Date.now();
  return `<div class="two-col live-panels">
    ${panel('控制规则',`<div class="setting-row"><div><strong>固定空房等待</strong><p>由设备依据本地条件与工作时段判断。</p></div><b class="rule-value">15 <small>分钟</small></b></div>
    <div class="setting-row"><div><strong>执行状态</strong><p>${actionContext(s)}</p></div>${badge(pauseLabel(s),s?.paused?'amber':'blue')}</div>
    <div class="live-controls">${control('pause_control','暂停控制')}${control('resume_control','恢复控制')}</div>
    <div class="live-controls"><label for="mode">运行模式</label><select id="mode"><option value="0">人工确认</option><option value="1" ${(modeInput??s?.mode)===1?'selected':''}>全自动模拟</option></select>${control('set_device_mode','提交模式')}</div>`)}
    ${panel('关机申请',`<div class="profile-art">${icon('shield')}<div><h3>${s?.pending===true?'待成员核实':'暂无可核实申请'}</h3>
      <p>${s?.pending===true?(hasTask?'请核对现场情况。成员可以否决。':'设备报告有申请，当前任务凭据尚不可用。'):'设备会在符合条件时上报申请。'}</p></div></div>
      <div class="live-controls"><button class="btn secondary" disabled>确认真实关机</button>${control('cancel_shutdown','否决本次申请')}</div>
      <p class="live-hint">真实关机需完成成员授权、独立 OFF 和反馈联调后开放。</p>`)}
    </div>
    ${panel('请求回执',`<p>${receipt?esc(resultLabels[receipt.status])+(receipt.message?' · '+esc(receipt.message):''):'尚无请求。'}</p>
      ${receipt&&connection==='ready'?action('查询结果','receipt','logs'):''}`)}
    ${calibration(s)}`;
}

function devices(s) {
  const refreshButton=`<button class="btn secondary" type="button" data-action="refresh" ${!GATEWAY_PATH||signedOut||refreshing?'disabled':''}>${icon('reset')}刷新设备</button>`;
  return `<div class="two-col live-panels">
    ${panel('EG800Z 主控',`${deviceRow('绑定设备',provider.session?.device.label||'尚未绑定','device',statusLabels[connection]||'未知')}
      <p>最近同步 · ${displayTime(s?.reportedAt)}</p><div class="live-controls">${refreshButton}
      <button class="btn secondary" type="button" data-action="logout" ${provider.session?'':'disabled'}>退出登录</button></div>`)}
    ${panel('添加到手机桌面',`<div class="profile-art">${icon('device')}<div><h3>从桌面打开栖息</h3><p>通过 HTTPS 地址安装；打开后自动刷新数据。</p></div></div>
      ${action('查看安装步骤','install-guide','download','primary')}`)}
    </div>${panel('接入与排查',`<p>从飞鸢授权、绑定设备，到状态检查和回执核对。</p><div class="live-controls">${action('开始使用教程','guide','help')}</div>`)}`;
}

function content(current,s) {
  if(current==='activity')return activity(s);
  if(current==='control')return controls(s);
  if(current==='logs')return panel('设备事件',eventList(s,100));
  if(current==='devices')return devices(s);
  return overview(s);
}

function connectionBanner(s) {
  if(connection==='ready')return '';
  const text = {
    unconfigured:'完成飞鸢网关配置后，这里会显示已授权的设备数据。',
    authentication:'通过部署方提供的成员登录入口进入，再刷新这里。',
    signed_out:'请通过成员登录入口重新登录。',
    forbidden:'请联系宿舍设备管理员核对成员授权。',
    offline:'恢复网络后会重新同步。',
    stale:'设备最近的报告可能已过期。',
    device_offline:'平台报告设备离线，请检查设备供电和网络。',
  }[connection] || '等待网关和设备报告恢复。';
  return `<div class="banner live-banner">${icon('wifi')}<div><strong>${esc(statusLabels[connection]||'连接未知')}</strong>
    <p>${esc(text)}${s?' 当前显示最后一次设备报告。':''}</p></div></div>`;
}

function render() {
  const current=page();
  const s=provider.snapshot;
  const focused=document.activeElement;
  const focusKey=app.contains(focused)&&(focused.id||focused.getAttribute('data-action')||focused.getAttribute('data-control'));
  const label=esc(provider.session?.device.label||'设备待绑定');
  app.innerHTML=`<aside class="sidebar"><a class="brand" href="#overview"><span class="brand-mark">${icon('home')}</span><span>栖息<small>HABITAT LIVE</small></span></a>
    <a class="room-selector" href="#devices">${icon('device')}<span>${label}<small>设备与连接</small></span></a>
    <nav aria-label="主导航">${links(current)}</nav>
    <div class="sidebar-bottom"><button class="nav-item" data-action="guide" aria-label="使用教程">${icon('help')}<span>使用教程</span></button></div></aside>
    <div class="workspace"><header class="topbar"><a class="live-brand" href="#overview">栖息 <small>LIVE</small></a>
    ${badge(statusLabels[connection]||'连接未知',connection==='ready'?'green':'amber')}</header>
    <main class="live-main" id="main" tabindex="-1"><header class="page-title live-title"><div><h1>${nav[current][0]}</h1><p>${subtitles[current]}</p></div>
    ${action('使用教程','guide','help',connection==='unconfigured')}</header>
    ${connectionBanner(s)}<div class="live-status" role="status">${esc(message)}</div>
    ${content(current,s)}</main></div>`;
  if (focusKey && /^[a-z_-]+$/.test(focusKey)) {
    const selector=focused.id?'#'+focusKey:focused.hasAttribute('data-control')?'[data-control="'+focusKey+'"]':'[data-action="'+focusKey+'"]';
    const matches=[...app.querySelectorAll(selector)];
    matches.find(item=>item.offsetWidth>0)?.focus({preventScroll:true});
  }
}

function schedule() {
  clearTimeout(timer);
  if (GATEWAY_PATH && !signedOut && !document.hidden && navigator.onLine) timer=setTimeout(refresh,delay);
}

async function refresh() {
  if (!GATEWAY_PATH || signedOut || refreshing || document.hidden) return;
  if (!navigator.onLine) {connection='offline';render();return;}
  refreshing=true;
  const generation=operation;
  try {
    const identity=provider.session && [provider.session.accountId,provider.session.device.id].join('\0');
    const snapshot=await provider.refresh();
    const currentIdentity=provider.session && [provider.session.accountId,provider.session.device.id].join('\0');
    if(identity!==currentIdentity){receipt=null;countInput='';modeInput=null;message='';}
    if (generation!==operation) return;
    connection=fresh(snapshot)?'ready':snapshot?.platformOnline===false?'device_offline':'stale';
    delay=10_000;
    if (page()==='logs'||page()==='overview') {
      try {
        const events=await provider.readEvents();
        eventStatus=events===null?'网关尚未开放事件查询。':events.length?'设备上报记录':'暂无设备事件。';
      } catch(error) {
        eventStatus='无法读取事件。';
        if (['authentication','forbidden'].includes(error.message)) throw error;
      }
    }
  } catch(error) {
    if (generation!==operation) return;
    connection=Object.hasOwn(statusLabels,error.message)?error.message:'unavailable';
    if (!provider.session) {receipt=null;countInput='';modeInput=null;message='';}
    delay=Math.min(delay*2,60_000);
  } finally {
    refreshing=false;
    render();
    schedule();
  }
}

async function submit(name,input={}) {
  if(busy || signedOut || connection!=='ready' || !navigator.onLine) return;
  busy=true;
  const generation=operation;
  render();
  try {
    const next=await provider.submit(name,input);
    if (operation!==generation) return;
    receipt=next;
    message=resultLabels[receipt.status];
  } catch(error) {
    if (operation!==generation) return;
    if (!provider.session) {receipt=null;countInput='';modeInput=null;connection=error.message;}
    message=statusLabels[error.message]||'当前条件不允许提交。';
  } finally {
    busy=false;
    render();
    void refresh();
  }
}

app.addEventListener('input',event=>{
  if(event.target.id==='count')countInput=event.target.value;
  if(event.target.id==='mode')modeInput=Number(event.target.value);
});
app.addEventListener('submit',event=>{
  if(event.target.id!=='count-form')return;
  event.preventDefault();
  if(countInput!==''&&event.target.reportValidity())void submit('calibrate_count',{target_count:Number(countInput)});
});
app.addEventListener('click',async event=>{
  const action=event.target.closest('button');
  if(!action || action.disabled)return;
  if(action.dataset.action==='guide'||action.dataset.action==='install-guide') {
    guide.open(action.dataset.action==='install-guide'?3:0);
    return;
  }
  const name=action.dataset.control;
  if(name && name!=='calibrate_count') {
    void submit(name,name==='set_device_mode'?{target_mode:Number(document.getElementById('mode').value)}:{});
  }
  if(action.dataset.action==='refresh')void refresh();
  if(action.dataset.action==='receipt'&&receipt&&!busy) {
    const generation=operation;
    try {
      const next=await provider.result(receipt.requestId);
      if(generation===operation && receipt?.requestId===next.requestId) receipt=next;
    } catch(error) {
      if(generation===operation) {
        if(!provider.session){receipt=null;countInput='';modeInput=null;connection=error.message;}
        message=statusLabels[error.message]||'暂时无法查询回执。';
      }
    }
    render();
  }
  if(action.dataset.action==='logout') {
    operation++;
    signedOut=true;
    clearTimeout(timer);
    const logout=provider.logout();
    receipt=null;
    message='';
    countInput='';modeInput=null;
    connection='signed_out';
    render();
    try {await logout;}
    catch {message='已清除本页数据。服务端退出未确认，请在登录系统中退出。';}
    render();
  }
});
addEventListener('hashchange',()=>{render();if(page()==='logs')void refresh();});
addEventListener('offline',()=>{clearTimeout(timer);connection='offline';render();});
addEventListener('online',()=>{if(!GATEWAY_PATH){connection='unconfigured';render();}else void refresh();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else void refresh();});
addEventListener('pagehide',()=>{operation++;clearTimeout(timer);provider.release();receipt=null;countInput='';modeInput=null;render();});
addEventListener('pageshow',event=>{if(event.persisted)void refresh();});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
render();
void refresh();
