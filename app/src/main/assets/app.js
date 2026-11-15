'use strict';
const STORAGE='game_resource_planner_profiles_v3'; // Legacy storage key retained for v6.1 profiles.
const UI_STORAGE='kt_ui_language_v7',REPORT_STORAGE='kt_report_language_v7';
const SUPPORTED=['vi','en','zh-Hant','ja'];
let uiLang=SUPPORTED.includes(localStorage.getItem(UI_STORAGE))?localStorage.getItem(UI_STORAGE):'vi';
let reportLang=SUPPORTED.includes(localStorage.getItem(REPORT_STORAGE))?localStorage.getItem(REPORT_STORAGE):uiLang;
const LOCALE={vi:'vi-VN',en:'en-US','zh-Hant':'zh-TW',ja:'ja-JP'};
function T(key,lang=uiLang){return (globalThis.KTLocale?.[lang]?.[key]) || (globalThis.KTLocale?.vi?.[key]) || key;}
const translate=(str,lang=uiLang)=>String(str??'').split(/(\s*[;+]\s*)/).map(piece=>T(piece.trim(),lang)===piece.trim()?piece:T(piece.trim(),lang)).join('');
function setLanguage(lang){
 if(!SUPPORTED.includes(lang))return;
 uiLang=lang;localStorage.setItem(UI_STORAGE,uiLang);document.documentElement.lang=lang;
 document.querySelectorAll('[data-t]').forEach(node=>{node.textContent=T(node.dataset.t)});
 if(result){render();renderSnapshots();}else{renderSnapshots();}
 if(el('currentSection'))el('currentSection').textContent=T(names[activeTab]);
}

// HiGHS WebAssembly solves offline in a dedicated Web Worker. Android only saves files.
const isAndroidApp=()=>typeof window.Android!=='undefined' && typeof window.Android.run==='function';
const androidRequests=new Map();
let androidRequestSerial=0;
function androidCall(kind,payload='',profile=''){
  return new Promise((resolve,reject)=>{
    if(!isAndroidApp()){reject(Error('Không tìm thấy cầu nối Android.'));return;}
    const key='req'+(++androidRequestSerial);
    androidRequests.set(key,{resolve,reject});
    window.Android.run(kind,key,String(payload),String(profile));
  });
}
window.__mobileFinish=(key,ok,value)=>{
  const request=androidRequests.get(key);
  if(!request)return;
  androidRequests.delete(key);
  if(ok)request.resolve(value);
  else request.reject(Error(value||'Lỗi Android'));
};
const optimizationRequests=new Map();
let optSeq=0,solverWorker=null;
function optimizeWasm(config){
 return new Promise((resolve,reject)=>{
  if(!solverWorker){
   solverWorker=new Worker('./solver-worker.js');
   solverWorker.onmessage=e=>{
    const msg=e.data||{},req=optimizationRequests.get(msg.id);
    if(!req)return;optimizationRequests.delete(msg.id);
    if(msg.ok)req.resolve(msg.result);else req.reject(new Error(msg.error||'Bộ giải không thể tính kế hoạch.'));
   };
   solverWorker.onerror=e=>{for(const req of optimizationRequests.values())req.reject(new Error('HiGHS WebAssembly không khởi động được: '+e.message));optimizationRequests.clear();solverWorker.terminate();solverWorker=null;};
  }
  const id=++optSeq;optimizationRequests.set(id,{resolve,reject});solverWorker.postMessage({id,config});
 });
}
const fmt = n => new Intl.NumberFormat(LOCALE[uiLang],{maximumFractionDigits:0}).format(Number(n)||0);
const html = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el = id=>document.getElementById(id);
const names={overview:'overview',weeks:'events',transactions:'trades',daily:'daily',months:'monthly',boss:'boss',plans:'plans',help:'help'};
const fields={start_date:'startDate',end_date:'endDate',initial_quartz:'initialQuartz',initial_silver:'initialSilver',silver_used_month:'silverNov',gold_used_month:'goldNov',ongoing_core_bought:'ongoingCore',ongoing_bonus_bought:'ongoingBonus',damage_g:'damage',forecast_mode:'mode',monthly_growth_g:'growth',completion_mode:'completionMode'};
const defaultConfig=()=>({start_date:'2026-11-16',end_date:'2028-04-30',initial_quartz:9052,initial_silver:0,silver_used_month:70000,gold_used_month:6,ongoing_core_bought:0,ongoing_bonus_bought:0,damage_g:5.82,forecast_mode:'fixed',monthly_growth_g:0.04,boss_entries:{},completion_mode:'auto'});
let profiles=[], selected=0, result=null, modalDate=null, activeTab='overview';
const selectedYear=()=>el('yearFilter')?.value||'all';
const yearRows=(rows,field='date')=>{const y=selectedYear();return y==='all'?rows:rows.filter(x=>String(x[field]||'').startsWith(y))};
function newProfile(name='Người chơi mới') {return {id:Date.now()+Math.random(),name,config:defaultConfig(),snapshots:[]};}
function migrate(config){
 const x={...config};if(!x.start_date){x.start_date='2026-11-16';x.end_date=x.end_date||'2028-04-30';}
 if(x.silver_used_month===undefined)x.silver_used_month=x.silver_used_nov??(x.start_date==='2026-11-16'?70000:0);
 if(x.gold_used_month===undefined)x.gold_used_month=x.gold_used_nov??(x.start_date==='2026-11-16'?6:0);
 return {...defaultConfig(),...x};
}
function load(){try{const raw=JSON.parse(localStorage.getItem(STORAGE));if(Array.isArray(raw)&&raw.length)profiles=raw.filter(p=>p&&typeof p.name==='string'&&p.config&&typeof p.config==='object').slice(0,100).map(p=>({...p,snapshots:Array.isArray(p.snapshots)?p.snapshots:[],config:migrate(p.config)}));}catch(e){}if(!profiles.length)profiles=[newProfile(T('Người chơi'))];}

function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(profiles));el('saveStatus').textContent=T('savedDevice');}catch(e){el('saveStatus').textContent=T('saveFailed');}}
function selector(){const s=el('profiles');s.innerHTML=profiles.map((p,i)=>`<option value="${i}">${html(p.name)}</option>`).join('');s.value=selected;}
function fillConfig(){let c=profiles[selected].config;Object.entries(fields).forEach(([k,id])=>{el(id).value=c[k]??defaultConfig()[k]});el('endDate').min=c.start_date;selector();renderSnapshots();}
function readConfig(){const config=profiles[selected].config;for(const [k,id] of Object.entries(fields)){const str=el(id).value;if(['forecast_mode','completion_mode','start_date','end_date'].includes(k))config[k]=str;else config[k]=Number(str);}if(!config.boss_entries)config.boss_entries={};persist();return config;}
function dirty(){result=null;el('output').classList.add('hidden');el('notice').classList.remove('hidden','error','success');el('notice').textContent=T('changed');}
function setNotice(msg,type='success'){el('notice').classList.remove('hidden','error','success');el('notice').classList.add(type);el('notice').textContent=msg;}
function tab(which){activeTab=which;document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===which));document.querySelectorAll('.tabview').forEach(s=>s.classList.toggle('active',s.id==='tab-'+which));document.querySelectorAll('.tabview').forEach(s=>s.style.display=s.classList.contains('active')?'block':'none');el('currentSection').textContent=T(names[which]);if(which==='boss')renderBoss();}
function damageReward(g){const m=Math.round(Math.max(0,Number(g)||0)*1000);return [[1000,1600,6],[1600,3500,19],[3500,5500,20],[5500,10000,45]].reduce((sum,[lo,hi,step])=>sum+Math.floor(Math.max(0,Math.min(m,hi)-lo)/step)*60,0);}
async function calculate(){try{
  const config=readConfig();el('notice').classList.add('hidden');el('loading').classList.remove('hidden');el('calculate').disabled=true;
  let payload;
  if(isAndroidApp()) payload=await optimizeWasm(config);
  else {
    const res=await fetch('/api/optimize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});
    payload=await res.json();if(!res.ok)throw Error(payload.error||T('calculateFailed'));
  }
  result=payload;populateYears();render();el('output').classList.remove('hidden');
  const t=payload.totals;
  if(t.core_complete===t.core_total){setNotice(T('successMessage').replace('{core}',`${t.core_complete}/${t.core_total}`).replace('{bonus}',`${t.bonus_bought}/${t.bonus_max}`).replace('{gold}',fmt(t.gold_gained)),'success');}
  else {setNotice(T('partialMessage').replace('{core}',`${t.core_complete}/${t.core_total}`), 'error');}
}catch(e){setNotice(T('errorPrefix')+e.message,'error');}finally{el('loading').classList.add('hidden');el('calculate').disabled=false;}}
function render(){if(!result)return;const t=result.totals;const q=t.quartz_total;
  const cards=[
    ['Đủ phần thưởng cốt lõi',`${t.core_complete}/${t.core_total}`,'Sự kiện tuần được hoàn thành','green','✦'],
    ['Chợ lấp lánh bổ sung',`${t.bonus_bought}/${t.bonus_max}`,'Đã ưu tiên các Chợ diễn ra sớm nhất','purple','◇'],
    ['Khối vàng mua thêm',fmt(t.gold_gained),`${fmt(t.gold_times)} ${T('goldExchangeUnit')}`,'gold','◆'],
    ['Đá tím có thể sử dụng',fmt(q),'Bao gồm số dư đầu kỳ và toàn bộ nguồn thu','blue','◈'],
    ['Bạc đổi trong kỳ',fmt(t.silver_exchanged),'Đã kiểm tra hạn mức từng tháng','','▣'],
    ['Đá dùng trực tiếp',fmt(t.quartz_event_spent),'Cho Chuẩn bị toàn diện','','○'],
    ['Đá tím cuối kỳ',fmt(t.quartz_end),'remainingAfterPlan','purple','◈'],
    ['Bạc tồn cuối kỳ',fmt(t.silver_end),`${dateFmt(result.period.end)}`,'','◇'],
  ];
  el('kpiCards').innerHTML=cards.map(([name,val,desc,cls,icon])=>`<article class="kpi ${cls}"><span class="kpi-icon">${icon}</span><div class="kpi-name">${html(T(name))}</div><div class="kpi-val">${val}</div><div class="kpi-desc">${html(T(desc))}</div></article>`).join('');
  el('referenceBadge').textContent=`${T('bossDamage')}: ${Number(result.input.damage_g).toFixed(3).replace(/\.?0+$/,'')}G`;
  el('periodLabel').textContent=dateFmt(result.period.start)+' → '+dateFmt(result.period.end);el('periodLength').textContent=fmt(result.period.days);
  renderTable('weeksTable',['Tuần','Mở sự kiện (T3)','Hạn chót','Sự kiện','Hoàn thành ngày','Boss (G)','Đá boss','Liên minh','Xưởng','Cốt lõi','Lượt còn thiếu','Chợ thêm','Lượt Chợ bỏ','Bạc chi','Đá chi','Số ngày mua','Trạng thái'],yearRows(result.events).map(e=>[
    e.index,dateFmt(e.event_start),dateFmt(e.deadline),html(T(e.event)),e.completion_date?dateFmt(e.completion_date):T('Chưa hoàn thành'),Number(e.damage_g).toFixed(3),fmt(e.reward_boss),fmt(e.mission_income),fmt(e.workshop_income),`${e.core_bought}/${e.core_units}`,e.core_units-e.core_bought,e.event==='Chợ lấp lánh'?`${e.bonus_bought}/${e.bonus_limit||12}`:'·',e.event==='Chợ lấp lánh'?(e.bonus_missed?`<span class="badge-warn" title="${html(e.bonus_reason)}">${e.bonus_missed} ${T('units')}</span>`:'0'):'·',fmt(e.silver_spent),fmt(e.quartz_spent),e.purchase_days,e.core_complete?`<span class="badge-ok">${html(T('Đạt cốt lõi'))}</span>`:`<span class="badge-warn">${html(T('Thiếu cốt lõi'))}</span>`
  ]));
  renderTransactions();
  renderTable('dailyTable',['Ngày','Thứ','Boss','Liên minh','Xưởng','Đổi bạc','Bạc chi sự kiện','Đá chi sự kiện','Lượt đổi vàng','Đá cuối ngày','Bạc cuối ngày'],yearRows(result.daily).map(d=>[
    dateFmt(d.date),['T2','T3','T4','T5','T6','T7','CN'][d.weekday],fmt(d.boss),fmt(d.mission),fmt(d.workshop),fmt(d.silver_exchanged),fmt(d.event_silver),fmt(d.event_quartz),fmt(d.gold_times),fmt(d.quartz_balance),fmt(d.silver_balance)
  ]));
  renderTable('monthsTable',['Tháng','Thu đá','Đổi bạc','Bạc chi','Bạc tồn','Cốt lõi','Chợ thêm','Lượt vàng','Vàng','Đá cuối tháng','Hạn mức bạc còn','Lượt vàng còn'],yearRows(result.months,'month').map(m=>[m.month,fmt(m.quartz_income),fmt(m.silver_exchanged),fmt(m.silver_spent),fmt(m.silver_end),`${m.core_complete}/${m.core_total}`,fmt(m.market_bonus),fmt(m.gold_times),fmt(m.gold_gained),fmt(m.quartz_end),fmt(m.silver_quota_left),fmt(m.gold_quota_left)]));
  el('quartzChart').innerHTML=makeChart(yearRows(result.months,'month').map(x=>x.quartz_end),'#725ad9','#ece8ff',yearRows(result.months,'month').map(x=>x.month));
  el('goldChart').innerHTML=makeChart(yearRows(result.months,'month').map(x=>x.gold_gained),'#cf9b32','#fff3d7',yearRows(result.months,'month').map(x=>x.month));
  renderBoss();tab(activeTab);
}
// Read-only aggregation from the backend; no resource calculation is changed in the UI.
function isTxMatch(x,filter){
  if(filter==='silver')return x.type==='Đổi bạc';
  if(filter==='gold')return x.type==='Mua vàng';
  if(filter==='events')return x.type.startsWith('Mua ')&&x.type!=='Mua vàng';
  return true;
}
function isDayMatch(r,filter){
  if(filter==='silver')return r.quartz_to_silver>0;
  if(filter==='gold')return r.gold_times>0;
  if(filter==='events')return r.silver_spent>0||r.quartz_event_spent>0;
  return true;
}
function renderTransactions(){
  if(!result)return;
  const view=el('txView').value,filter=el('txFilter').value;
  if(view==='detail'){
    const xs=yearRows(result.transactions).filter(x=>isTxMatch(x,filter));
    renderTable('txTable',['Ngày','Thời điểm','Loại','Sự kiện','Đá sử dụng','Bạc sử dụng','Bạc nhận','Vàng nhận','Đá còn','Bạc còn'],xs.map(x=>[
      dateFmt(x.date),html(x.moment),`<span class="${x.type==='Mua vàng'?'type-gold':'type-silver'}">${html(x.type)}</span>`,html(T(x.event||'·')),fmt(x.quartz_used),fmt(x.silver_used),fmt(x.silver_gained),fmt(x.gold_gained),fmt(x.quartz_left),fmt(x.silver_left)
    ]));
    el('txCount').textContent=`${fmt(xs.length)} giao dịch gốc`;
    return;
  }
  const days=yearRows(result.transaction_days||[]).filter(r=>isDayMatch(r,filter));
  const detailHTML=r=>`<details class="tx-details"><summary>${fmt(r.transaction_count)} lượt · Xem chi tiết</summary><ul>${r.details.map(x=>`<li><b>${html(x.type)}</b>${x.event?' · '+html(x.event):''} · ${x.quartz_used?fmt(x.quartz_used)+' đá tím':''}${x.quartz_used&&x.silver_used?' + ':''}${x.silver_used?fmt(x.silver_used)+' bạc':''}${!x.quartz_used&&!x.silver_used?'nhận '+fmt(x.silver_gained)+' bạc':''}${x.gold_gained?' → '+fmt(x.gold_gained)+' vàng':''}</li>`).join('')}</ul></details>`;
  renderTable('txTable',[
    'Ngày','Sự kiện / hoạt động','Xem lượt mua','Đá nhận','Đá đổi bạc','Bạc nhận','Bạc chi sự kiện','Đá chi trực tiếp','Đá đổi vàng','Vàng nhận','Đá cuối ngày','Bạc cuối ngày'
  ],days.map(r=>[
    dateFmt(r.date),`<span class="tx-activity">${html(translate(r.action))}</span>`,detailHTML(r),fmt(r.quartz_income),fmt(r.quartz_to_silver),fmt(r.silver_gained),fmt(r.silver_spent),fmt(r.quartz_event_spent),fmt(r.quartz_to_gold),fmt(r.gold_gained),fmt(r.quartz_end),fmt(r.silver_end)
  ]));
  el('txCount').textContent=`${fmt(days.length)} ngày có giao dịch`;
}
function dateFmt(s){if(!s)return '';return new Intl.DateTimeFormat(LOCALE[uiLang],{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(s+'T00:00:00Z'));}
function renderTable(id,headers,rows){
 el(id).innerHTML=`<thead><tr>${headers.map(h=>`<th>${html(T(h))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
 localizeNodes(el(id));
}
function localizeNodes(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const raw=n.nodeValue,trim=raw.trim();if(trim&&T(trim)!==trim)n.nodeValue=raw.replace(trim,T(trim));}}
function populateYears(){const select=el('yearFilter');const previous=select.value;const years=[...new Set(result?.daily.map(x=>x.date.slice(0,4))||[])];select.innerHTML=`<option value="all">${html(T('allYears'))}</option>`+years.map(y=>`<option value="${y}">${y}</option>`).join('');select.value=years.includes(previous)?previous:'all';}

function makeChart(values,primary,light,labels=[]){const w=600,h=220,left=35,top=13,bottom=32,usableH=h-top-bottom,usableW=w-left-8,max=Math.max(1,...values),gap=8,n=values.length,bw=(usableW/n)-gap;
  let bars=values.map((v,i)=>{const valY=top+usableH-(v/max)*usableH,x=left+i*(usableW/n)+gap/2,bh=top+usableH-valY;return `<rect x="${x}" y="${valY}" width="${Math.max(4,bw)}" height="${Math.max(1,bh)}" fill="${primary}" rx="3"><title>${fmt(v)}</title></rect><text x="${x+bw/2}" y="${h-7}" text-anchor="middle" font-size="10" fill="#8691a7">${(labels[i]||'').slice(5)+'/'+(labels[i]||'').slice(2,4)}</text>`}).join('');
  let grid=[0,.25,.5,.75,1].map(x=>{const y=top+usableH-x*usableH;return `<line x1="${left}" y1="${y}" x2="${w}" y2="${y}" stroke="#eaeef5" stroke-width="1"/><text x="${left-6}" y="${y+3}" text-anchor="end" fill="#8995a8" font-size="9">${Math.round(max*x/1000)}k</text>`}).join('');
  return `<svg role="img" aria-label="Biểu đồ tài nguyên theo tháng được chọn" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}${bars}</svg>`;
}
function renderBoss(){if(!result)return;const rows=yearRows(result.events).filter(w=>w.date>=result.period.start).map(w=>[dateFmt(w.date),html(T(w.event)),Number(w.damage_g).toFixed(3),fmt(w.reward_boss),w.damage_source==='thực tế'?'<span class="badge-ok">Thực tế</span>':'<span class="badge-warn">Dự báo</span>',w.hits.length?`${w.hits.length}/20`:'·',`<button class="edit-boss" data-date="${w.date}">Sửa 20 lượt</button>`]);renderTable('bossTable',['Thứ Hai','Sự kiện','Điểm tốt nhất (G)','Đá nhận','Dữ liệu','Lượt nhập','Thao tác'],rows);document.querySelectorAll('.edit-boss').forEach(btn=>btn.addEventListener('click',()=>openBoss(btn.dataset.date)));}
function openBoss(d){modalDate=d;const val=profiles[selected].config.boss_entries?.[d];el('modalTitle').textContent='Boss thứ Hai '+dateFmt(d);el('bossHits').value=Array.isArray(val)?val.join('\n'):val===undefined?'':String(val);el('bossPreview').textContent='Nhập tối đa 20 lượt. Chỉ lấy lượt cao nhất.';el('bossModal').classList.remove('hidden');el('bossHits').focus();previewBoss();}
function parseHits(){const s=el('bossHits').value.trim();if(!s)return [];const chunks=s.split(/[;\s]+/).filter(Boolean);if(chunks.length>20)throw Error('Chỉ cho phép tối đa 20 lượt đánh.');const vals=chunks.map(x=>Number(x));if(vals.some(x=>!Number.isFinite(x)||x<0||x>10))throw Error('Mỗi lượt phải là số từ 0 đến 10G, dùng dấu chấm thập phân.');return vals;}
function previewBoss(){try{const xs=parseHits();el('bossPreview').textContent=xs.length?`Đã nhập ${xs.length}/20 lượt · Cao nhất ${Math.max(...xs).toFixed(3)}G · ${fmt(damageReward(Math.max(...xs)))} đá tím`:'Không có dữ liệu thực tế. Tuần này sẽ dùng dự báo.';}catch(e){el('bossPreview').textContent='⚠ '+e.message;}}
function saveBoss(clear){try{const cfg=readConfig();const xs=clear?[]:parseHits();if(xs.length)cfg.boss_entries[modalDate]=xs;else delete cfg.boss_entries[modalDate];persist();el('bossModal').classList.add('hidden');dirty();tab('boss');setNotice('Đã lưu dữ liệu boss. Nhấn TÍNH KẾ HOẠCH để tính lại số dư và lịch đổi.','success');}catch(e){el('bossPreview').textContent='⚠ '+e.message;}}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
async function exportCsv(){try{const cfg=readConfig();el('exportCsv').disabled=true;el('exportCsv').textContent=T('exporting');if(isAndroidApp()){
      if(!result)throw Error(T('needPlan'));
      await androidCall('csv',JSON.stringify({...result,report_language:reportLang}),profiles[selected].name);
      setNotice(T('csvSaved'),'success');return;
    }
    const res=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({result,language:reportLang,profile:profiles[selected].name})});if(!res.ok){const err=await res.json();throw Error(err.error)}download(await res.blob(),'Ke_hoach_bac_vang_'+profiles[selected].name.replace(/[^a-zA-Z0-9_\-]/g,'_')+'.zip');setNotice(T('csvDone'),'success')}catch(e){setNotice(T('exportError')+e.message,'error')}finally{el('exportCsv').disabled=false;el('exportCsv').textContent=T('exportCsv');}}
async function exportExcel(){
  if(!result){setNotice(T('needPlan'),'error');return;}
  try{
    const cfg=readConfig(),btn=el('exportExcel');btn.disabled=true;btn.textContent=T('exportingExcel');
    if(isAndroidApp()){
      await androidCall('excel',JSON.stringify({...result,report_language:reportLang}),profiles[selected].name);
      setNotice(T('excelSaved'),'success');return;
    }
    const res=await fetch('/api/excel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({result,language:reportLang,profile:profiles[selected].name})});
    if(!res.ok){const err=await res.json();throw Error(err.error||'Không thể xuất Excel.');}
    download(await res.blob(),'Khoang_Thach_v7_Ke_hoach_'+profiles[selected].name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx');
    setNotice(T('excelDone'),'success');
  }catch(e){setNotice(T('exportError')+e.message,'error');}
  finally{el('exportExcel').disabled=false;el('exportExcel').textContent=T('exportExcel');}
}
function printAmethyst(lang){
 if(!result){setNotice(T('needPlan'),'error');return;}
 lang=SUPPORTED.includes(lang)?lang:'vi';
 const titles={vi:{title:'LỊCH SỬ DỤNG ĐÁ TÍM',player:'Người chơi',date:'Ngày',silver:'Đá đổi bạc',gold:'Đá đổi vàng',direct:'Đá dùng sự kiện',sum:'Tổng đá sử dụng',total:'TỔNG CỘNG',days:'Số ngày chi tiêu',help:'Trong hộp thoại in, chọn Lưu thành PDF.'},en:{title:'AMETHYST SPENDING SCHEDULE',player:'Player',date:'Date',silver:'For Silver',gold:'For Gold',direct:'Event Use',sum:'Total Amethyst Used',total:'TOTAL',days:'Spending days',help:'In the print dialog, select Save as PDF.'},'zh-Hant':{title:'紫水晶使用計劃表',player:'玩家',date:'日期',silver:'兌換銀塊',gold:'兌換黃金',direct:'活動消耗',sum:'紫水晶總消耗',total:'合計',days:'消耗天數',help:'請在列印對話框中選取「儲存為 PDF」。'},ja:{title:'アメジスト使用計画表',player:'プレイヤー',date:'日付',silver:'銀への交換',gold:'金への交換',direct:'イベント消費',sum:'使用アメジスト合計',total:'合計',days:'使用日数',help:'印刷ダイアログで「PDFとして保存」を選択してください。'}};
 const t=titles[lang],player=profiles[selected].name;
 const rows=result.transaction_days.filter(r=>r.quartz_to_silver+r.quartz_to_gold+r.quartz_event_spent>0),sums=[0,0,0,0];
 const nfmt=n=>new Intl.NumberFormat(LOCALE[lang]).format(n);
 const df=s=>new Intl.DateTimeFormat(LOCALE[lang],{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s+'T00:00:00Z'));
 const lines=rows.map((r,i)=>{const v=[r.quartz_to_silver,r.quartz_to_gold,r.quartz_event_spent,r.quartz_to_silver+r.quartz_to_gold+r.quartz_event_spent];v.forEach((x,j)=>sums[j]+=x);return `<tr><td>${i+1}</td><td>${html(df(r.date))}</td>${v.map(x=>`<td class="num">${nfmt(x)}</td>`).join('')}</tr>`}).join('');
 const page=`<!doctype html><html lang="${lang}"><head><meta charset="UTF-8"><title>${html(t.title)} - ${html(player)}</title><style>@page{size:A4 landscape;margin:12mm 12mm 14mm}body{font-family:"Noto Sans CJK TC","Noto Sans CJK JP","Microsoft JhengHei","Yu Gothic",Arial,sans-serif;color:#24324b;font-size:10pt;margin:0}header{margin-bottom:12px;border-bottom:2px solid #6f5fca;padding-bottom:12px}h1{font-size:19pt;margin:0 0 5px}small{color:#58647b}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:6px;border-bottom:1px solid #e2e5ee}th{background:#efedfb;text-align:left}td.num{text-align:right;font-variant-numeric:tabular-nums}td:first-child,th:first-child{width:7%;text-align:center}td:nth-child(2),th:nth-child(2){width:19%}tfoot td{background:#efedfb;font-weight:bold;border-top:2px solid #6958ca}tr{break-inside:avoid}footer{margin:10px 0;font-size:8pt;color:#75819a}</style></head><body><header><h1>${html(t.title)}</h1><small>${html(t.player)}: ${html(player)} | ${html(df(result.period.start))} → ${html(df(result.period.end))} | ${html(t.days)}: ${rows.length}</small></header><table><thead><tr><th>No.</th><th>${html(t.date)}</th><th>${html(t.silver)}</th><th>${html(t.gold)}</th><th>${html(t.direct)}</th><th>${html(t.sum)}</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="2">${html(t.total)}</td>${sums.map(x=>`<td class="num">${nfmt(x)}</td>`).join('')}</tr></tfoot></table><footer>${html(t.help)}</footer></body></html>`;
 if(isAndroidApp()){window.Android.printHtml(page);return;}
 const w=window.open('','_blank');if(!w){setNotice(T('popupBlocked'),'error');return;}
 w.document.open();w.document.write(page);w.document.close();w.onload=()=>setTimeout(()=>w.print(),250);
}
function exportJson(){readConfig();const payload={version:7,exported:new Date().toISOString(),ui_language:uiLang,report_language:reportLang,profiles};const data=JSON.stringify(payload,null,2);if(isAndroidApp()){androidCall('backup',data).then(()=>setNotice(T('backupSaved'),'success')).catch(e=>setNotice(T('exportError')+e.message,'error'));return;}download(new Blob([data],{type:'application/json;charset=utf8'}),'Ho_so_khoang_thach.json')}
function importJsonText(t){try{const val=JSON.parse(t);if(!Array.isArray(val.profiles)||!val.profiles.length)throw Error('File không có hồ sơ hợp lệ.');const safe=val.profiles.slice(0,100).filter(p=>p&&typeof p.name==='string'&&p.config&&typeof p.config==='object').map(p=>({id:Date.now()+Math.random(),name:p.name.slice(0,80),config:migrate(p.config),snapshots:Array.isArray(p.snapshots)?p.snapshots:[]}));if(!safe.length)throw Error('Không có hồ sơ hợp lệ.');if(!confirm(`Nhập ${safe.length} hồ sơ và thay thế danh sách trên máy này?`))return;profiles=safe;selected=0;fillConfig();persist();dirty();setNotice(`Đã nhập ${safe.length} hồ sơ.`,'success')}catch(e){setNotice('Không đọc được JSON: '+e.message,'error')}}
function importJson(file){file.text().then(importJsonText).catch(e=>setNotice('Không đọc được JSON: '+e.message,'error'));}
function savePlan(){
 try{const cfg=JSON.parse(JSON.stringify(readConfig()));const ps=profiles[selected];
  const label=prompt(T('snapshotName'),`${cfg.start_date} → ${cfg.end_date}`);if(label===null)return;
  ps.snapshots=ps.snapshots||[];ps.snapshots.push({id:Date.now()+Math.random(),name:(label.trim()||`${cfg.start_date} → ${cfg.end_date}`).slice(0,80),saved:new Date().toISOString(),config:cfg,totals:result?JSON.parse(JSON.stringify(result.totals)):null});
  ps.snapshots=ps.snapshots.slice(-60);persist();renderSnapshots();setNotice(T('savedSnapshot'),'success');
 }catch(e){setNotice(e.message,'error');}
}
function renderSnapshots(){
 const ps=profiles[selected];if(!ps||!el('snapshotsTable'))return;const list=ps.snapshots||[];
 for(const id of ['snapshotA','snapshotB']){
  const old=el(id).value;el(id).innerHTML=list.map((p,i)=>`<option value="${i}">${html(p.name)} (${p.config.start_date})</option>`).join('');el(id).value=old&&Number(old)<list.length?old:id==='snapshotA'?'0':String(Math.max(0,list.length-1));
 }
 el('snapshotsTable').innerHTML=`<thead><tr>${['snapshotName','snapshotDate','samplePeriod','snapshotCore','snapshotBonus','snapshotGold','Thao tác'].map(x=>`<th>${html(T(x))}</th>`).join('')}</tr></thead><tbody>`+list.map((p,i)=>`<tr><td>${html(p.name)}</td><td>${html(p.saved.slice(0,16).replace('T',' '))}</td><td>${html(p.config.start_date)} → ${html(p.config.end_date)}</td><td>${p.totals?`${p.totals.core_complete}/${p.totals.core_total}`:'·'}</td><td>${p.totals?`${p.totals.bonus_bought}/${p.totals.bonus_max}`:'·'}</td><td>${p.totals?fmt(p.totals.gold_gained):'·'}</td><td><button class="restore-snapshot" data-id="${i}">${html(T('snapshotRestore'))}</button> <button class="delete-snapshot" data-id="${i}">${html(T('snapshotDelete'))}</button></td></tr>`).join('')+'</tbody>';
 el('snapshotsTable').querySelectorAll('.restore-snapshot').forEach(b=>b.onclick=()=>{const p=list[Number(b.dataset.id)];if(!confirm(T('confirmRestore')))return;profiles[selected].config=migrate(JSON.parse(JSON.stringify(p.config)));fillConfig();persist();dirty();tab('overview');});
 el('snapshotsTable').querySelectorAll('.delete-snapshot').forEach(b=>b.onclick=()=>{if(!confirm(T('confirmDelete')))return;list.splice(Number(b.dataset.id),1);persist();renderSnapshots();});
}
function comparePlans(){const list=profiles[selected].snapshots||[],a=list[Number(el('snapshotA').value)],b=list[Number(el('snapshotB').value)];if(!a||!b||!a.totals||!b.totals){el('planComparison').textContent=T('needTwoPlans');return;}
 const rows=[['samplePeriod',a.config.start_date+' → '+a.config.end_date,b.config.start_date+' → '+b.config.end_date],['snapshotCore',`${a.totals.core_complete}/${a.totals.core_total}`,`${b.totals.core_complete}/${b.totals.core_total}`],['snapshotBonus',`${a.totals.bonus_bought}/${a.totals.bonus_max}`,`${b.totals.bonus_bought}/${b.totals.bonus_max}`],['snapshotGold',a.totals.gold_gained,b.totals.gold_gained],['quartzNow',a.totals.quartz_end,b.totals.quartz_end]];
 el('planComparison').innerHTML=`<table><thead><tr><th>${html(T('Bảng thống kê'))}</th><th>${html(a.name)}</th><th>${html(b.name)}</th></tr></thead><tbody>`+rows.map(([key,x,y])=>`<tr><td>${html(T(key))}</td><td>${html(x)}</td><td>${html(y)}</td></tr>`).join('')+'</tbody></table>';
}
function start(){
 load();el('uiLanguage').value=uiLang;el('reportLanguage').value=reportLang;fillConfig();setLanguage(uiLang);
 el('uiLanguage').onchange=e=>setLanguage(e.target.value);
 el('reportLanguage').onchange=e=>{reportLang=e.target.value;localStorage.setItem(REPORT_STORAGE,reportLang)};
 document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
 Object.values(fields).forEach(id=>el(id).addEventListener('change',()=>{readConfig();dirty();if(id==='startDate')el('endDate').min=el('startDate').value;}));
 el('profiles').onchange=()=>{readConfig();selected=Number(el('profiles').value);fillConfig();dirty();};
 el('profileAdd').onclick=()=>{const name=prompt(T('newProfile'),T('Người chơi')+' '+(profiles.length+1));if(!name?.trim())return;readConfig();profiles.push(newProfile(name.trim().slice(0,80)));selected=profiles.length-1;fillConfig();persist();dirty()};
 el('profileClone').onclick=()=>{readConfig();let copy=JSON.parse(JSON.stringify(profiles[selected]));copy.id=Date.now()+Math.random();copy.name+=' (copy)';profiles.push(copy);selected=profiles.length-1;fillConfig();persist();dirty()};
 el('profileRename').onclick=()=>{const name=prompt(T('renameProfile'),profiles[selected].name);if(!name?.trim())return;profiles[selected].name=name.trim().slice(0,80);selector();persist()};
 el('profileDelete').onclick=()=>{if(profiles.length===1){alert(T('keepOneProfile'));return;}if(!confirm(T('confirmDelete')))return;profiles.splice(selected,1);selected=0;fillConfig();persist();dirty()};
 el('yearFilter').onchange=()=>{if(result)render();};el('txView').onchange=renderTransactions;el('txFilter').onchange=renderTransactions;
 el('calculate').onclick=calculate;el('exportCsv').onclick=exportCsv;el('exportExcel').onclick=exportExcel;el('printPdf').onclick=()=>printAmethyst(reportLang);
 el('saveSnapshot').onclick=savePlan;el('comparePlans').onclick=comparePlans;
 el('exportJson').onclick=exportJson;
 el('importJson').onclick=()=>{if(isAndroidApp()){androidCall('import').then(importJsonText).catch(e=>setNotice(T('errorPrefix')+e.message,'error'));}else el('jsonFile').click()};
 el('jsonFile').onchange=e=>{if(e.target.files[0])importJson(e.target.files[0]);e.target.value='';};
 el('bossModalClose').onclick=()=>el('bossModal').classList.add('hidden');el('bossModal').onclick=e=>{if(e.target===el('bossModal'))el('bossModal').classList.add('hidden')};
 el('bossHits').oninput=previewBoss;el('bossSave').onclick=()=>saveBoss(false);el('bossClear').onclick=()=>saveBoss(true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')el('bossModal').classList.add('hidden')});
 el('periodLabel').textContent=dateFmt(el('startDate').value)+' → '+dateFmt(el('endDate').value);tab('overview');calculate();
}
window.addEventListener('DOMContentLoaded',start);
