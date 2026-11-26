import {QuecCloudAdapter, canSubmit, fresh} from './provider.js';
import {GATEWAY_PATH} from './config.js';
import {esc, formatCountdown, icon, nav} from './ui.js';

const provider = new QuecCloudAdapter(GATEWAY_PATH);
const app = document.getElementById('app');
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
let operation = 0;

function page() {
  const route = location.hash.slice(1);
  return Object.hasOwn(nav,route) ? route : 'overview';
}

function links(current) {
  return Object.entries(nav).map(([key,[label,symbol]]) =>
    `<a class="nav-item ${key===current?'active':''}" href="#${key}" ${key===current?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span></a>`).join('');
}

function card(title, body) {
  return `<article class="card padded live-panel"><h2>${title}</h2>${body}</article>`;
}

function control(name, label) {
  const enabled = connection==='ready' && !busy && canSubmit(name,provider.session,provider.snapshot);
  return `<button class="btn secondary" data-control="${name}" ${enabled?'':'disabled'}>${label}</button>`;
}

function overview(snapshot) {
  const age = snapshot ? '最后同步于 ' + displayTime(snapshot.reportedAt) : '尚无设备上报';
  return `<div class="live-summary">
    ${card('在寝人数',`<strong class="live-value">${snapshot?.count??'—'}</strong><p>${['人数未知','计数有效','通行存在歧义'][snapshot?.countStatus]??'人数未知'}</p>`)}
    ${card('设备倒计时',`<strong class="live-value mono">${formatCountdown(snapshot?.countdown)}</strong><p>设备固定等待 15 分钟</p>`)}
    ${card('模拟空调',`<strong class="live-value">${snapshot?.simState===true?'运行中':snapshot?.simState===false?'待机':'未知'}</strong><p>显示已验证的模拟接收反馈</p>`)}
  </div>${card('连接状态',`<p>${statusLabels[connection]} · ${age}</p><p>${snapshot?.pending===true?'设备报告有待确认任务，请前往空调控制。':'等待设备报告提醒。'}</p>`)}`;
}

function controls(snapshot) {
  const capacity = provider.session?.device.capacity;
  const task = snapshot?.currentTask && snapshot.currentTask.expiresAt>Date.now();
  return card('人数与模式',`<form id="count-form" class="live-controls"><label for="count">人数</label>
    <input type="number" id="count" min="0" max="${capacity??100}" step="1" value="${esc(countInput)}" required>
    ${control('calibrate_count','提交校准')}</form>
    <div class="live-controls">${control('pause_control','暂停控制')}${control('resume_control','恢复控制')}</div>
    <div class="live-controls"><label for="mode">模拟规则</label><select id="mode"><option value="0">人工确认</option><option value="1" ${snapshot?.mode===1?'selected':''}>全自动模拟</option></select>
    ${control('set_device_mode','提交模式')}</div>`) +
    card('关机申请',`<p>${snapshot?.pending===true?(task?'请先核实房间情况。成员可以否决。':'收到待确认标记，当前任务凭据尚不可用。'):'暂无可核实的关机申请。'}</p>
    <label><input type="checkbox" disabled> 已现场核实房间情况</label>
    <div class="live-controls"><button class="btn secondary" disabled>确认真实关机</button>${control('cancel_shutdown','否决本次申请')}</div>
    <p>真实关机功能待成员授权、独立 OFF 和实际反馈联调后开放。</p>`) +
    card('请求回执',`<p>${receipt?esc(resultLabels[receipt.status])+' · '+esc(receipt.message):'尚无请求。'}</p>
    ${receipt&&connection==='ready'?'<button class="btn secondary" data-action="receipt">查询结果</button>':''}`);
}

function content(current,snapshot) {
  if(current==='activity') return card('门口检测',`<p>${['空闲','检测中','异常'][snapshot?.detection]??'未知'}</p><p>HC-SR04 超声波与 KY-032 避障检测</p><p>${esc(snapshot?.error||'暂无已上报异常。')}</p>`);
  if(current==='control') return controls(snapshot);
  if(current==='logs') return card('设备事件',`<p>${esc(eventStatus||'等待网关提供事件能力。')}</p>
    <ul class="live-events">${provider.events.map(entry=>`<li><strong>${eventLabels[entry.kind]}</strong> · ${displayTime(entry.at)} <span>${esc(entry.message)}</span></li>`).join('')}</ul>`);
  if(current==='devices') return card('设备信息',`<p>设备 · ${esc(provider.session?.device.label||'未绑定')}</p><p>最近同步 · ${displayTime(snapshot?.reportedAt)}</p>
    <div class="live-controls"><button class="btn secondary" data-action="refresh" ${!GATEWAY_PATH||signedOut?'disabled':''}>刷新设备</button>
    <button class="btn secondary" data-action="logout" ${provider.session?'':'disabled'}>退出登录</button></div>`)+
    card('添加到手机桌面',`<p>iPhone 在 Safari 的共享菜单选“添加到主屏幕”。Android 在 Chrome 菜单选“安装应用”或“添加到主屏幕”。请使用 HTTPS 地址。</p><p>在网页打开时接收已接入的设备事件。后台推送待联调。</p>`);
  return overview(snapshot);
}

function render() {
  const current = page();
  const snapshot = provider.snapshot;
  const focused = document.activeElement;
  const focusKey = focused?.id || focused?.getAttribute('data-action') || focused?.getAttribute('data-control');
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#overview"><span class="brand-mark">${icon('home')}</span><span>栖息<small>HABITAT LIVE</small></span></a>
    <nav aria-label="主导航">${links(current)}</nav></aside><div class="workspace">
    <header class="topbar"><strong>Habitat Live · 栖息</strong><span>${statusLabels[connection]}</span></header>
    <main class="live-main" id="main"><header class="live-title"><h1>${nav[current][0]}</h1><p>${esc(provider.session?.device.label || '设备数据待接入')}</p></header>
    <div class="live-status" role="status">${esc(message || (connection==='unconfigured'?'待部署经过成员鉴权的飞鸢网关。':connection==='authentication'?'请使用部署方提供的成员登录入口。':''))}</div>
    ${content(current,snapshot)}</main></div><nav class="live-mobile" aria-label="移动导航">${links(current)}</nav>`;
  if (focusKey && /^[a-z_]+$/.test(focusKey)) {
    app.querySelector(`#${focusKey},[data-action="${focusKey}"],[data-control="${focusKey}"]`)?.focus({preventScroll:true});
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
    if(identity!==currentIdentity){receipt=null;countInput='';message='';}
    if (generation!==operation) return;
    connection=fresh(snapshot)?'ready':snapshot?.platformOnline===false?'device_offline':'stale';
    delay=10_000;
    if (page()==='logs') {
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
    if (!provider.session) {receipt=null;countInput='';message='';}
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
    if (!provider.session) {receipt=null;countInput='';connection=error.message;}
    message=statusLabels[error.message]||'当前条件不允许提交。';
  } finally {
    busy=false;
    render();
    void refresh();
  }
}

app.addEventListener('input',event=>{if(event.target.id==='count')countInput=event.target.value;});
app.addEventListener('submit',event=>{
  if(event.target.id!=='count-form')return;
  event.preventDefault();
  if(countInput!==''&&event.target.reportValidity())void submit('calibrate_count',{target_count:Number(countInput)});
});
app.addEventListener('click',async event=>{
  const action=event.target.closest('button');
  if(!action)return;
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
        if(!provider.session){receipt=null;countInput='';connection=error.message;}
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
    countInput='';
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
addEventListener('pagehide',()=>{operation++;clearTimeout(timer);provider.release();receipt=null;countInput='';render();});
addEventListener('pageshow',event=>{if(event.persisted)void refresh();});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
render();
void refresh();
