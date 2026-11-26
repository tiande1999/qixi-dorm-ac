const paths={
 home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z M9 21v-8h6v8',
 grid:'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 ac:'M4 4h16a1 1 0 0 1 1 1v7H3V5a1 1 0 0 1 1-1Z M3 9h18 M7 15v3c0 2-3 2-3 0 M12 15v6 M17 15v3c0 2 3 2 3 0',
 device:'M6 3h12v18H6Z M10 6h4 M11 17h2',
 logs:'M6 3h12v18H6Z M9 7h6 M9 11h6 M9 15h4',
 arrow:'m9 5 7 7-7 7',arrowRight:'M4 12h16 M14 6l6 6-6 6',
 leaf:'M4 20C1 4 12 2 21 3c1 12-3 18-12 15 M4 20 16 8',
 check:'m5 12 4 4L19 6',
 timer:'M9 2h6 M12 6v6l3 2 M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
 play:'m8 4 12 8-12 8Z',pause:'M8 5v14 M16 5v14',
 settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
 help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9 9a3 3 0 1 1 4 2.83V14 M12 17h.01',
 reset:'M3 10a9 9 0 1 1 2 9 M3 4v6h6',
 enter:'M14 3h6v18h-6 M3 12h12 M10 7l5 5-5 5',
 exit:'M10 3H4v18h6 M9 12h12 M16 7l5 5-5 5',
 wifi:'M2 8a17 17 0 0 1 20 0 M5 12a12 12 0 0 1 14 0 M8 16a7 7 0 0 1 8 0 M12 20h.01',
 alert:'m12 3 10 18H2Z M12 9v5 M12 17h.01',
 close:'m6 6 12 12 M6 18 18 6',
 plus:'M12 5v14 M5 12h14',minus:'M5 12h14',
 door:'M4 21V3h12v18 M10 12h.01 M2 21h20',
 scan:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 12h10',
 download:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
 search:'M19 19l-5-5 M16 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
 shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z m-4 9 3 3 5-6',
 sun:'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
 bell:'M5 16V9a7 7 0 0 1 14 0v7l2 2H3Z M10 21h4',
 bolt:'m13 2-9 12h7l-1 8 10-13h-7Z',
 code:'m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
 snow:'M12 2v20 M3.3 7l17.4 10 M3.3 17 20.7 7 M9 4l3 3 3-3 M9 20l3-3 3 3'
};
export const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
export const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const nav = {
  overview: ['宿舍总览', 'grid'],
  activity: ['人员感知', 'users'],
  control: ['空调控制', 'ac'],
  devices: ['设备管理', 'device'],
  logs: ['事件记录', 'logs'],
};

export function formatCountdown(seconds) {
  if (seconds == null) return '—';
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  return minutes + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}
