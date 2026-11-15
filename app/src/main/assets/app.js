'use strict';
const STORAGE='game_resource_planner_profiles_v3'; // Retain v3 key: no loss of user profiles
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
const fmt = n => new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(Number(n)||0);
const html = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el = id=>document.getElementById(id);
const names={overview:'Tổng quan',weeks:'Lịch sự kiện',transactions:'Đổi bạc / vàng',daily:'Thu chi mỗi ngày',months:'Theo tháng',boss:'Boss thạch anh',help:'Hướng dẫn'};
const fields={initial_quartz:'initialQuartz',initial_silver:'initialSilver',silver_used_nov:'silverNov',gold_used_nov:'goldNov',damage_g:'damage',forecast_mode:'mode',monthly_growth_g:'growth',completion_mode:'completionMode'};
const defaultConfig=()=>({initial_quartz:9052,initial_silver:0,silver_used_nov:70000,gold_used_nov:6,damage_g:5.82,forecast_mode:'fixed',monthly_growth_g:0.04,boss_entries:{},completion_mode:'auto'});
let profiles=[], selected=0, result=null, modalDate=null, activeTab='overview';
const selectedYear=()=>el('yearFilter')?.value||'all';
const yearRows=(rows,field='date')=>{const y=selectedYear();return y==='all'?rows:rows.filter(x=>String(x[field]||'').startsWith(y))};
function newProfile(name='Người chơi mới') {return {id:Date.now()+Math.random(),name,config:defaultConfig()};}
function load(){try{const raw=JSON.parse(localStorage.getItem(STORAGE));if(Array.isArray(raw)&&raw.length)profiles=raw.filter(p=>p&&typeof p.name==='string'&&typeof p.config==='object').slice(0,100);}catch(e){}if(!profiles.length)profiles=[newProfile('Người chơi A')];}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(profiles));el('saveStatus').textContent='✓ Đã lưu hồ sơ trên thiết bị';}catch(e){el('saveStatus').textContent='⚠ Không thể tự lưu. Hãy sao lưu JSON.';}}
function selector(){const s=el('profiles');s.innerHTML=profiles.map((p,i)=>`<option value="${i}">${html(p.name)}</option>`).join('');s.value=selected;}
function fillConfig(){let c=profiles[selected].config;Object.entries(fields).forEach(([k,id])=>{el(id).value=c[k]??defaultConfig()[k]});selector();}
function readConfig(){const config=profiles[selected].config;for(const [k,id] of Object.entries(fields)){const str=el(id).value;if(k==='forecast_mode'||k==='completion_mode')config[k]=str;else config[k]=Number(str);}if(!config.boss_entries)config.boss_entries={};persist();return config;}
function dirty(){result=null;el('output').classList.add('hidden');el('notice').classList.remove('hidden','error','success');el('notice').textContent='Thông số đã thay đổi. Bấm TÍNH KẾ HOẠCH để cập nhật lịch.';}
function setNotice(msg,type='success'){el('notice').classList.remove('hidden','error','success');el('notice').classList.add(type);el('notice').textContent=msg;}
function tab(which){activeTab=which;document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===which));document.querySelectorAll('.tabview').forEach(s=>s.classList.toggle('active',s.id==='tab-'+which));document.querySelectorAll('.tabview').forEach(s=>s.style.display=s.classList.contains('active')?'block':'none');el('currentSection').textContent=names[which];if(which==='boss')renderBoss();}
function damageReward(g){const m=Math.round(Math.max(0,Number(g)||0)*1000);return [[1000,1600,6],[1600,3500,19],[3500,5500,20],[5500,10000,45]].reduce((sum,[lo,hi,step])=>sum+Math.floor(Math.max(0,Math.min(m,hi)-lo)/step)*60,0);}
async function calculate(){try{
  const config=readConfig();el('notice').classList.add('hidden');el('loading').classList.remove('hidden');el('calculate').disabled=true;
  let payload;
  if(isAndroidApp()) payload=await optimizeWasm(config);
  else {
    const res=await fetch('/api/optimize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});
    payload=await res.json();if(!res.ok)throw Error(payload.error||'Không tính được kế hoạch.');
  }
  result=payload;render();el('output').classList.remove('hidden');
  const t=payload.totals;
  if(t.core_complete===t.core_total){setNotice(`✓ Bảo đảm ${t.core_complete}/${t.core_total} sự kiện cốt lõi. Chợ bổ sung ${t.bonus_bought}/${t.bonus_max} lượt. Mua được ${fmt(t.gold_gained)} vàng.`,'success');}
  else {setNotice(`⚠ Chỉ hoàn thành đủ ${t.core_complete}/${t.core_total} sự kiện cốt lõi. Kế hoạch đã ưu tiên tối đa số sự kiện và phần thưởng cốt lõi.`, 'error');}
}catch(e){setNotice('Không thể tính kế hoạch: '+e.message,'error');}finally{el('loading').classList.add('hidden');el('calculate').disabled=false;}}
function render(){if(!result)return;const t=result.totals;const q=t.quartz_total;
  const cards=[
    ['Đủ phần thưởng cốt lõi',`${t.core_complete}/${t.core_total}`,'Sự kiện tuần được hoàn thành','green','✦'],
    ['Chợ lấp lánh bổ sung',`${t.bonus_bought}/${t.bonus_max}`,'Đã ưu tiên các Chợ diễn ra sớm nhất','purple','◇'],
    ['Khối vàng mua thêm',fmt(t.gold_gained),`${fmt(t.gold_times)} lượt đổi vàng`,'gold','◆'],
    ['Đá tím có thể sử dụng',fmt(q),'Bao gồm số dư đầu kỳ và toàn bộ nguồn thu','blue','◈'],
    ['Bạc đổi trong kỳ',fmt(t.silver_exchanged),'Đã kiểm tra hạn mức từng tháng','','▣'],
    ['Đá dùng trực tiếp',fmt(t.quartz_event_spent),'Cho Chuẩn bị toàn diện','','○'],
    ['Đá tím cuối kỳ',fmt(t.quartz_end),'Sau khi đủ nghĩa vụ đến hết năm','purple','◈'],
    ['Bạc tồn cuối kỳ',fmt(t.silver_end),'Chợ cuối kỳ kết thúc 30/04/2028','','◇'],
  ];
  el('kpiCards').innerHTML=cards.map(([name,val,desc,cls,icon])=>`<article class="kpi ${cls}"><span class="kpi-icon">${icon}</span><div class="kpi-name">${html(name)}</div><div class="kpi-val">${val}</div><div class="kpi-desc">${html(desc)}</div></article>`).join('');
  el('referenceBadge').textContent=`Boss tham chiếu ${Number(result.input.damage_g).toFixed(3).replace(/\.?0+$/,'')}G`;
  renderTable('weeksTable',['Tuần','Mở sự kiện (T3)','Hạn chót','Sự kiện','Hoàn thành ngày','Boss (G)','Đá boss','Liên minh','Xưởng','Cốt lõi','Lượt còn thiếu','Chợ thêm','Lượt Chợ bỏ','Bạc chi','Đá chi','Số ngày mua','Trạng thái'],yearRows(result.events).map(e=>[
    e.index,dateFmt(e.event_start),dateFmt(e.deadline),html(e.event),e.completion_date?dateFmt(e.completion_date):'Chưa hoàn thành',Number(e.damage_g).toFixed(3),fmt(e.reward_boss),fmt(e.mission_income),fmt(e.workshop_income),`${e.core_bought}/${e.core_units}`,e.core_units-e.core_bought,e.event==='Chợ lấp lánh'?`${e.bonus_bought}/15`:'·',e.event==='Chợ lấp lánh'?(e.bonus_missed?`<span class="badge-warn" title="${html(e.bonus_reason)}">${e.bonus_missed} lượt</span>`:'0'):'·',fmt(e.silver_spent),fmt(e.quartz_spent),e.purchase_days,e.core_complete?'<span class="badge-ok">Đạt cốt lõi</span>':'<span class="badge-warn">Thiếu cốt lõi</span>'
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
      dateFmt(x.date),html(x.moment),`<span class="${x.type==='Mua vàng'?'type-gold':'type-silver'}">${html(x.type)}</span>`,html(x.event||'·'),fmt(x.quartz_used),fmt(x.silver_used),fmt(x.silver_gained),fmt(x.gold_gained),fmt(x.quartz_left),fmt(x.silver_left)
    ]));
    el('txCount').textContent=`${fmt(xs.length)} giao dịch gốc`;
    return;
  }
  const days=yearRows(result.transaction_days||[]).filter(r=>isDayMatch(r,filter));
  const detailHTML=r=>`<details class="tx-details"><summary>${fmt(r.transaction_count)} lượt · Xem chi tiết</summary><ul>${r.details.map(x=>`<li><b>${html(x.type)}</b>${x.event?' · '+html(x.event):''} · ${x.quartz_used?fmt(x.quartz_used)+' đá tím':''}${x.quartz_used&&x.silver_used?' + ':''}${x.silver_used?fmt(x.silver_used)+' bạc':''}${!x.quartz_used&&!x.silver_used?'nhận '+fmt(x.silver_gained)+' bạc':''}${x.gold_gained?' → '+fmt(x.gold_gained)+' vàng':''}</li>`).join('')}</ul></details>`;
  renderTable('txTable',[
    'Ngày','Sự kiện / hoạt động','Xem lượt mua','Đá nhận','Đá đổi bạc','Bạc nhận','Bạc chi sự kiện','Đá chi trực tiếp','Đá đổi vàng','Vàng nhận','Đá cuối ngày','Bạc cuối ngày'
  ],days.map(r=>[
    dateFmt(r.date),`<span class="tx-activity">${html(r.action)}</span>`,detailHTML(r),fmt(r.quartz_income),fmt(r.quartz_to_silver),fmt(r.silver_gained),fmt(r.silver_spent),fmt(r.quartz_event_spent),fmt(r.quartz_to_gold),fmt(r.gold_gained),fmt(r.quartz_end),fmt(r.silver_end)
  ]));
  el('txCount').textContent=`${fmt(days.length)} ngày có giao dịch`;
}
function dateFmt(s){const a=s.split('-');return `${a[2]}/${a[1]}/${a[0]}`}
function renderTable(id,headers,rows){el(id).innerHTML=`<thead><tr>${headers.map(h=>`<th>${html(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`}
function makeChart(values,primary,light,labels=[]){const w=600,h=220,left=35,top=13,bottom=32,usableH=h-top-bottom,usableW=w-left-8,max=Math.max(1,...values),gap=8,n=values.length,bw=(usableW/n)-gap;
  let bars=values.map((v,i)=>{const valY=top+usableH-(v/max)*usableH,x=left+i*(usableW/n)+gap/2,bh=top+usableH-valY;return `<rect x="${x}" y="${valY}" width="${Math.max(4,bw)}" height="${Math.max(1,bh)}" fill="${primary}" rx="3"><title>${fmt(v)}</title></rect><text x="${x+bw/2}" y="${h-7}" text-anchor="middle" font-size="10" fill="#8691a7">${(labels[i]||'').slice(5)+'/'+(labels[i]||'').slice(2,4)}</text>`}).join('');
  let grid=[0,.25,.5,.75,1].map(x=>{const y=top+usableH-x*usableH;return `<line x1="${left}" y1="${y}" x2="${w}" y2="${y}" stroke="#eaeef5" stroke-width="1"/><text x="${left-6}" y="${y+3}" text-anchor="end" fill="#8995a8" font-size="9">${Math.round(max*x/1000)}k</text>`}).join('');
  return `<svg role="img" aria-label="Biểu đồ tài nguyên theo tháng được chọn" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grid}${bars}</svg>`;
}
function renderBoss(){if(!result)return;const rows=yearRows(result.events).map(w=>[dateFmt(w.date),html(w.event),Number(w.damage_g).toFixed(3),fmt(w.reward_boss),w.damage_source==='thực tế'?'<span class="badge-ok">Thực tế</span>':'<span class="badge-warn">Dự báo</span>',w.hits.length?`${w.hits.length}/20`:'·',`<button class="edit-boss" data-date="${w.date}">Sửa 20 lượt</button>`]);renderTable('bossTable',['Thứ Hai','Sự kiện','Điểm tốt nhất (G)','Đá nhận','Dữ liệu','Lượt nhập','Thao tác'],rows);document.querySelectorAll('.edit-boss').forEach(btn=>btn.addEventListener('click',()=>openBoss(btn.dataset.date)));}
function openBoss(d){modalDate=d;const val=profiles[selected].config.boss_entries?.[d];el('modalTitle').textContent='Boss thứ Hai '+dateFmt(d);el('bossHits').value=Array.isArray(val)?val.join('\n'):val===undefined?'':String(val);el('bossPreview').textContent='Nhập tối đa 20 lượt. Chỉ lấy lượt cao nhất.';el('bossModal').classList.remove('hidden');el('bossHits').focus();previewBoss();}
function parseHits(){const s=el('bossHits').value.trim();if(!s)return [];const chunks=s.split(/[;\s]+/).filter(Boolean);if(chunks.length>20)throw Error('Chỉ cho phép tối đa 20 lượt đánh.');const vals=chunks.map(x=>Number(x));if(vals.some(x=>!Number.isFinite(x)||x<0||x>10))throw Error('Mỗi lượt phải là số từ 0 đến 10G, dùng dấu chấm thập phân.');return vals;}
function previewBoss(){try{const xs=parseHits();el('bossPreview').textContent=xs.length?`Đã nhập ${xs.length}/20 lượt · Cao nhất ${Math.max(...xs).toFixed(3)}G · ${fmt(damageReward(Math.max(...xs)))} đá tím`:'Không có dữ liệu thực tế. Tuần này sẽ dùng dự báo.';}catch(e){el('bossPreview').textContent='⚠ '+e.message;}}
function saveBoss(clear){try{const cfg=readConfig();const xs=clear?[]:parseHits();if(xs.length)cfg.boss_entries[modalDate]=xs;else delete cfg.boss_entries[modalDate];persist();el('bossModal').classList.add('hidden');dirty();tab('boss');setNotice('Đã lưu dữ liệu boss. Nhấn TÍNH KẾ HOẠCH để tính lại số dư và lịch đổi.','success');}catch(e){el('bossPreview').textContent='⚠ '+e.message;}}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
async function exportCsv(){try{const cfg=readConfig();el('exportCsv').disabled=true;el('exportCsv').textContent='Đang xuất...';if(isAndroidApp()){
      if(!result)throw Error('Hãy tính kế hoạch trước khi xuất CSV.');
      await androidCall('csv',JSON.stringify(result),profiles[selected].name);
      setNotice('Đã lưu ZIP chứa các bảng CSV trên điện thoại.','success');return;
    }
    const res=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:cfg,profile:profiles[selected].name})});if(!res.ok){const err=await res.json();throw Error(err.error)}download(await res.blob(),'Ke_hoach_bac_vang_'+profiles[selected].name.replace(/[^a-zA-Z0-9_\-]/g,'_')+'.zip');setNotice('Đã xuất ZIP gồm 10 bảng CSV; bảng 04 gộp theo ngày, bảng 09 giữ chi tiết.','success')}catch(e){setNotice('Lỗi xuất dữ liệu: '+e.message,'error')}finally{el('exportCsv').disabled=false;el('exportCsv').textContent='⇩ Xuất CSV';}}
async function exportExcel(){
  if(!result){setNotice('Hãy tính kế hoạch trước khi xuất Excel.','error');return;}
  try{
    const cfg=readConfig(),btn=el('exportExcel');btn.disabled=true;btn.textContent='Đang xuất Excel...';
    if(isAndroidApp()){
      await androidCall('excel',JSON.stringify(result),profiles[selected].name);
      setNotice('Đã lưu Excel trên điện thoại.','success');return;
    }
    const res=await fetch('/api/excel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:cfg,profile:profiles[selected].name})});
    if(!res.ok){const err=await res.json();throw Error(err.error||'Không thể xuất Excel.');}
    download(await res.blob(),'Khoang_Thach_v5_Ke_hoach_'+profiles[selected].name.replace(/[^a-zA-Z0-9_-]/g,'_')+'.xlsx');
    setNotice('Đã xuất Excel với lịch sự kiện mới, giao dịch gộp theo ngày và đối soát tồn kho.','success');
  }catch(e){setNotice('Lỗi xuất Excel: '+e.message,'error');}
  finally{el('exportExcel').disabled=false;el('exportExcel').textContent='⇩ Xuất Excel';}
}
function printAmethyst(lang){
  if(!result){setNotice('Hãy tính kế hoạch trước khi in PDF.','error');return;}
  const zh=lang==='zh',p=profiles[selected].name;
  const text=zh?{title:'紫水晶使用計劃表',player:'玩家',date:'日期',silver:'兌換銀塊',gold:'兌換金塊',direct:'活動直接消耗',sum:'紫水晶總使用量',total:'合計',days:'有消耗的天數',help:'請在列印對話框中選取「另存為 PDF」。'}:
    {title:'AMETHYST SPENDING SCHEDULE',player:'Player',date:'Date',silver:'For Silver',gold:'For Gold',direct:'Direct Use',sum:'Total Amethyst',total:'TOTAL',days:'Spending days',help:'In the Print dialog, choose Save as PDF.'};
  const rows=result.transaction_days.filter(r=>r.quartz_to_silver+r.quartz_to_gold+r.quartz_event_spent>0);
  const sums=[0,0,0,0];
  const lines=rows.map((r,i)=>{const values=[r.quartz_to_silver,r.quartz_to_gold,r.quartz_event_spent,r.quartz_to_silver+r.quartz_to_gold+r.quartz_event_spent];values.forEach((v,j)=>sums[j]+=v);return `<tr><td>${i+1}</td><td>${dateFmt(r.date)}</td>${values.map(v=>`<td class="num">${fmt(v)}</td>`).join('')}</tr>`}).join('');
  const page=`<!doctype html><html lang="${zh?'zh-Hant':'en'}"><head><meta charset="utf-8"><title>${html(text.title)} - ${html(p)}</title><style>
    @page{size:A4 landscape;margin:12mm 12mm 14mm}*{box-sizing:border-box}body{font-family:${zh?'"Microsoft JhengHei", "Noto Sans CJK TC",':'Arial,'}sans-serif;color:#23314b;margin:0;font-size:10pt}header{padding-bottom:14px;border-bottom:2px solid #5b57cc;margin-bottom:10px}h1{margin:0 0 5px;font-size:19pt;letter-spacing:.4px}small{color:#68758b}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#ecebfa;text-align:left;font-size:9pt;padding:7px 6px;border-bottom:1px solid #cad0de}td{padding:5px 6px;border-bottom:1px solid #e3e7ef}tbody tr:nth-child(even){background:#f8f9fd}td.num{text-align:right;font-variant-numeric:tabular-nums}th:nth-child(1),td:nth-child(1){width:6%;text-align:center}th:nth-child(2),td:nth-child(2){width:18%}tfoot td{background:#eeedf9;font-weight:700;border-top:2px solid #5b57cc;padding:8px 6px}tr{break-inside:avoid}footer{margin-top:12px;color:#777;font-size:9pt}@media screen{body{max-width:1100px;margin:24px auto;padding:0 10px}}</style></head><body>
    <header><h1>${html(text.title)}</h1><small>${html(text.player)}: ${html(p)} | 16/11/2026 - 30/04/2028 | ${text.days}: ${rows.length}</small></header>
    <table><thead><tr><th>No.</th><th>${text.date}</th><th>${text.silver}</th><th>${text.gold}</th><th>${text.direct}</th><th>${text.sum}</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="2">${text.total}</td>${sums.map(x=>`<td class="num">${fmt(x)}</td>`).join('')}</tr></tfoot></table><footer>${text.help}</footer>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`;
  if(isAndroidApp()){window.Android.printHtml(page);return;}
  const popup=window.open('','_blank');
  if(!popup){setNotice('Trình duyệt chặn cửa sổ in PDF. Hãy cho phép popup rồi thử lại.','error');return;}
  popup.document.open();popup.document.write(page);popup.document.close();
}
function exportJson(){readConfig();const payload={version:5,exported:new Date().toISOString(),profiles};const data=JSON.stringify(payload,null,2);if(isAndroidApp()){androidCall('backup',data).then(()=>setNotice('Đã lưu bản sao lưu JSON.','success')).catch(e=>setNotice('Lưu thất bại: '+e.message,'error'));return;}download(new Blob([data],{type:'application/json;charset=utf8'}),'Ho_so_khoang_thach.json')}
function importJsonText(t){try{const val=JSON.parse(t);if(!Array.isArray(val.profiles)||!val.profiles.length)throw Error('File không có hồ sơ hợp lệ.');const safe=val.profiles.slice(0,100).filter(p=>p&&typeof p.name==='string'&&p.config&&typeof p.config==='object').map(p=>({id:Date.now()+Math.random(),name:p.name.slice(0,80),config:{...defaultConfig(),...p.config}}));if(!safe.length)throw Error('Không có hồ sơ hợp lệ.');if(!confirm(`Nhập ${safe.length} hồ sơ và thay thế danh sách trên máy này?`))return;profiles=safe;selected=0;fillConfig();persist();dirty();setNotice(`Đã nhập ${safe.length} hồ sơ.`,'success')}catch(e){setNotice('Không đọc được JSON: '+e.message,'error')}}
function importJson(file){file.text().then(importJsonText).catch(e=>setNotice('Không đọc được JSON: '+e.message,'error'));}
function start(){load();fillConfig();document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));Object.values(fields).forEach(id=>el(id).addEventListener('change',()=>{readConfig();dirty()}));el('profiles').addEventListener('change',()=>{readConfig();selected=Number(el('profiles').value);fillConfig();dirty()});el('profileAdd').onclick=()=>{const name=prompt('Tên người chơi mới:','Người chơi '+(profiles.length+1));if(!name?.trim())return;readConfig();profiles.push(newProfile(name.trim().slice(0,80)));selected=profiles.length-1;fillConfig();persist();dirty()};el('profileClone').onclick=()=>{readConfig();let copied=JSON.parse(JSON.stringify(profiles[selected]));copied.id=Date.now()+Math.random();copied.name+=' (bản sao)';profiles.push(copied);selected=profiles.length-1;fillConfig();persist();dirty()};el('profileRename').onclick=()=>{const name=prompt('Đổi tên hồ sơ:',profiles[selected].name);if(!name?.trim())return;profiles[selected].name=name.trim().slice(0,80);selector();persist()};el('profileDelete').onclick=()=>{if(profiles.length===1){alert('Cần giữ ít nhất một hồ sơ.');return}if(!confirm('Xóa hồ sơ đang chọn?'))return;profiles.splice(selected,1);selected=0;fillConfig();persist();dirty()};el('yearFilter').addEventListener('change',()=>{if(result)render();});el('txView').addEventListener('change',renderTransactions);el('txFilter').addEventListener('change',renderTransactions);el('calculate').onclick=calculate;el('exportCsv').onclick=exportCsv;el('exportExcel').onclick=exportExcel;el('pdfEn').onclick=()=>printAmethyst('en');el('pdfZh').onclick=()=>printAmethyst('zh');el('exportJson').onclick=exportJson;el('importJson').onclick=()=>{if(isAndroidApp()){androidCall('import').then(importJsonText).catch(e=>setNotice('Nhập hồ sơ: '+e.message,'error'));}else el('jsonFile').click()};el('jsonFile').onchange=e=>{if(e.target.files[0])importJson(e.target.files[0]);e.target.value=''};el('bossModalClose').onclick=()=>el('bossModal').classList.add('hidden');el('bossModal').onclick=e=>{if(e.target===el('bossModal'))el('bossModal').classList.add('hidden')};el('bossHits').addEventListener('input',previewBoss);el('bossSave').onclick=()=>saveBoss(false);el('bossClear').onclick=()=>saveBoss(true);document.addEventListener('keydown',e=>{if(e.key==='Escape')el('bossModal').classList.add('hidden')});tab('overview');calculate();}
window.addEventListener('DOMContentLoaded',start);
