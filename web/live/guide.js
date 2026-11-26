import {icon} from './ui.js';

const steps = [
  {tab:'连接', title:'连接宿舍设备', symbol:'wifi', route:'devices', link:'打开设备管理',
   text:'从部署方提供的入口登录。登录后打开「设备管理」，核对设备名称与最近同步时间。',
   note:'如果显示「网关尚未配置」，请由项目负责人完成飞鸢产品授权、测试设备绑定和应用网关配置。'},
  {tab:'读数', title:'读懂宿舍状态', symbol:'users', route:'overview', link:'打开宿舍总览',
   text:'总览显示设备上报的人数、可信状态与倒计时。「—」表示当前没有可信人数。空房倒计时由 EG800Z 计时，固定 15 分钟。',
   note:'离线时核对最后同步时间。模拟空调卡片随独立接收反馈更新，实际空调状态需现场核实。'},
  {tab:'操作', title:'校准、暂停与看回执', symbol:'shield', route:'control', link:'打开空调控制',
   text:'现场数清人数后提交校准。需要暂缓执行时，选择「暂停控制」；设备上报有效关机申请且你有权限时，可以否决。',
   note:'「设备已接受」表示设备收到了请求。请在「请求回执」核查执行结果。真实关机当前未开放。'},
  {tab:'安装', title:'把栖息放到手机桌面', symbol:'device', route:'devices', link:'返回设备管理',
   text:'先用手机的系统浏览器打开部署后的 HTTPS 地址。',
   devices:[['iPhone / iPad','Safari → 共享 → 添加到主屏幕。'],['Android','Chrome → ⋮ → 安装应用，或添加到主屏幕。']],
   note:'打开桌面图标后，应用会刷新设备数据。设备消息在页面打开时查看；后台通知仍待接入。'},
];

export function createGuide() {
  const dialog=document.createElement('dialog');
  dialog.className='modal live-guide';
  dialog.setAttribute('aria-labelledby','live-guide-title');
  document.body.append(dialog);
  let index=0;
  let opener;
  let routeAfterClose;

  function render() {
    const {title,symbol,text,devices,note,route,link}=steps[index];
    dialog.innerHTML=`<div class="dialog-top"><span class="live-guide-icon">${icon(symbol)}</span>
      <button type="button" class="icon-btn" data-guide="close" aria-label="关闭教程">${icon('close')}</button></div>
      <nav class="live-guide-steps" aria-label="教程步骤">${steps.map(({tab},i)=>`<button type="button" data-guide-step="${i}"
         ${i===index?'aria-current="step"':''}>${tab}</button>`).join('')}</nav>
      <h2 id="live-guide-title" tabindex="-1">${title}</h2><p>${text}</p>
      ${devices?`<dl>${devices.map(([platform,info])=>`<div><dt>${platform}</dt><dd>${info}</dd></div>`).join('')}</dl>`:''}
      <p class="note">${note}</p>
      <div class="live-guide-actions"><a class="btn text-button" data-guide-route href="#${route}">${link}</a>
      ${index?'<button class="btn secondary" data-guide="back" type="button">上一步</button>':''}
      <button class="btn primary" type="button" data-guide="${index===steps.length-1?'close':'next'}">${index===steps.length-1?'完成':'下一步'}</button></div>`;
  }

  function focusTitle() {
    dialog.querySelector('#live-guide-title').focus({preventScroll:true});
  }

  dialog.addEventListener('click',event=>{
    const destination=event.target.closest('[data-guide-route]');
    if(destination) {
      routeAfterClose=true;
      dialog.close();
      return;
    }
    const button=event.target.closest('button');
    if(!button)return;
    const action=button.dataset.guide;
    if(action==='close'){dialog.close();return;}
    if(button.hasAttribute('data-guide-step'))index=Number(button.dataset.guideStep);
    else if(action==='back')index--;
    else if(action==='next')index++;
    else return;
    render();
    focusTitle();
  });
  dialog.addEventListener('close',()=>{
    if(routeAfterClose)document.getElementById('main')?.focus();
    else if(opener?.isConnected)opener.focus();
    else document.querySelector('.live-title [data-action="guide"]')?.focus();
  });
  return {open(step=0) {
    if(dialog.open)return;
    routeAfterClose=false;
    index=step;
    opener=document.activeElement;
    render();
    dialog.showModal();
    focusTitle();
  }};
}
