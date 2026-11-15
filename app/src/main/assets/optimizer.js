/* Khoang Thach v7: exact lexicographic integer model in portable JavaScript.
 * Browser worker calls HiGHS WebAssembly; test harness may supply an alternate exact MILP solver.
 * Logic ported line-by-line from v5.0 Python, retaining the same constraints and balances.
 */
(function(root){
'use strict';
const DAY=86400000, ANCHOR='2026-11-16', DEFAULT_END='2028-04-30';
const NAMES=['Trường bắn đoạt bảo','Chuẩn bị toàn diện','Thợ săn tiền thưởng','Chợ lấp lánh'];
const CORE=[5,2,6,6],KIND=['silver','quartz','silver','silver'];
const milliDate=s=>Date.parse(s+'T00:00:00Z');
const iso=ms=>new Date(ms).toISOString().slice(0,10);
const addDays=(s,n)=>iso(milliDate(s)+n*DAY);
const weekday=s=>(new Date(milliDate(s)).getUTCDay()+6)%7;
const monthEnd=s=>addDays(s.slice(0,7)+'-01',new Date(Date.UTC(Number(s.slice(0,4)),Number(s.slice(5,7)),0)).getUTCDate()-1);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validISO=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(milliDate(s))&&iso(milliDate(s))===s;
const dateDiff=(a,b)=>Math.round((milliDate(a)-milliDate(b))/DAY);
const eventIndexForDay=day=>Math.floor(dateDiff(day,ANCHOR)/7);
const eventData=(n,d)=>{
 const monday=addDays(ANCHOR,n*7),event_start=addDays(monday,1),event_end=addDays(monday,n%4===0?5:6);
 const shift=(Number(monday.slice(0,4))-2026)*12+Number(monday.slice(5,7))-11;
 const base=d.damage_g+(d.forecast_mode==='growth'?shift*d.monthly_growth_g:0);
 const actual=d.boss_entries[monday],damage=actual?actual.best:Math.round(Math.max(0,Math.min(10,base))*1e4)/1e4;
 return {date:monday,global_week:n+1,week_end:addDays(monday,6),event_start,event_end,deadline:event_end,event:NAMES[n%4],kind:KIND[n%4],core_units:CORE[n%4],reward_boss:reward(damage),damage_g:damage,damage_source:actual?'thực tế':'dự báo',hits:actual?actual.hits:[]};
};
function reward(g){if(!finite(g)||g<0||g>10)throw Error('Sát thương boss phải từ 0 đến 10G.');let m=Math.round(g*1000),n=0;for(let [lo,hi,step] of [[1000,1600,6],[1600,3500,19],[3500,5500,20],[5500,10000,45]])n+=Math.floor(Math.max(0,Math.min(hi,m)-lo)/step)*60;return n;}
function validate(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Hồ sơ không hợp lệ.');
 const old=!Object.hasOwn(raw,'start_date');
 const d={start_date:ANCHOR,end_date:DEFAULT_END,initial_quartz:9052,initial_silver:0,
  silver_used_month:old?(raw.silver_used_nov??70000):0,
  gold_used_month:old?(raw.gold_used_nov??6):0,damage_g:5.82,forecast_mode:'fixed',
  monthly_growth_g:0.04,boss_entries:{},completion_mode:'auto',
  ongoing_core_bought:0,ongoing_bonus_bought:0, ...raw};
 // Legacy profiles had Nov-2026 quotas. New fields only apply to the selected start month.
 if(!validISO(d.start_date)||!validISO(d.end_date)||d.start_date<ANCHOR||d.end_date<d.start_date)
   throw Error('Ngày bắt đầu/kết thúc không hợp lệ. Ngày kết thúc phải sau ngày bắt đầu.');
 if(dateDiff(d.end_date,d.start_date)>3652)throw Error('Khoảng kế hoạch vượt 10 năm. Hãy chia thành các giai đoạn để bảo đảm hiệu năng trên điện thoại.');
 for(const k of ['initial_quartz','initial_silver','silver_used_month','gold_used_month','ongoing_core_bought','ongoing_bonus_bought']){
  if(!Number.isSafeInteger(d[k])||d[k]<0||d[k]>1e10)throw Error(k+' phải là số nguyên không âm.');
 }
 if(d.silver_used_month>250000||d.gold_used_month>24)throw Error('Hạn mức đổi bạc hoặc vàng của tháng bắt đầu đã vượt quy định.');
 if(!finite(d.damage_g)||d.damage_g<0||d.damage_g>10||!finite(d.monthly_growth_g)||Math.abs(d.monthly_growth_g)>1)throw Error('Sát thương hoặc tăng trưởng boss không hợp lệ.');
 if(!['fixed','growth','manual'].includes(d.forecast_mode)||!['auto','early','sunday'].includes(d.completion_mode))throw Error('Chế độ dự báo hoặc hoàn thành không hợp lệ.');
 let entries=d.boss_entries||{};
 if(typeof entries!=='object'||Array.isArray(entries)||Object.keys(entries).length>1500)throw Error('Danh sách boss không hợp lệ.');
 const clean={};for(const [day,item] of Object.entries(entries)){
  if(!validISO(day)||day<ANCHOR||weekday(day)!==0)throw Error('Ngày boss không hợp lệ: '+day);
  const xs=(Array.isArray(item)?item:[item]).filter(v=>v!==null&&v!==''&&v!==undefined).map(Number);
  if(xs.length>20||xs.some(x=>!finite(x)||x<0||x>10))throw Error('Tối đa 20 sát thương, mỗi lượt 0–10G.');
  if(xs.length)clean[day]={hits:xs,best:Math.max(...xs),mode:'thực tế'};
 }
 d.boss_entries=clean;
 const n=eventIndexForDay(d.start_date),current=eventData(n,d);
 const active=d.start_date>current.event_start && d.start_date<=current.event_end;
 if(!active&&(d.ongoing_core_bought||d.ongoing_bonus_bought))throw Error('Không thể nhập lượt đã mua nếu đầu ngày bắt đầu không nằm giữa sự kiện.');
 if(d.ongoing_core_bought>current.core_units||d.ongoing_bonus_bought>(current.event==='Chợ lấp lánh'?15:0))
   throw Error('Số lượt đã mua trong sự kiện hiện tại vượt giới hạn.');
 d.snapshot_type='start_of_day';
 return d;
}
function weeksFor(d){
 const weeks=[],all=[];
 const start=eventIndexForDay(d.start_date),end=eventIndexForDay(d.end_date);
 for(let n=start;n<=end;n++){
  const w=eventData(n,d);all.push(w);
  if(w.event_start<=d.end_date&&w.event_end>=d.start_date){
   w.index=weeks.length+1;w.deadline=w.event_end<d.end_date?w.event_end:d.end_date;
   w.first_buy_day=w.event_start>d.start_date?w.event_start:d.start_date;
   w.core_before=n===start?d.ongoing_core_bought:0;
   w.bonus_before=n===start?d.ongoing_bonus_bought:0;
   weeks.push(w);
  }
 }
 return {weeks,all};
}

class LPBuilder{
 constructor(){this.cols=[];this.rows=[];}
 add(name,lo,hi){const i=this.cols.length;this.cols.push({name:'v'+i,lo,hi});return i;}
 rule(terms,lo=-Infinity,hi=Infinity){this.rows.push({terms:{...terms},lo,hi});}
 static expr(entries){let s='';for(let [k,val] of entries){if(!val)continue;const a=Math.abs(val);s+=(s?(val>=0?' + ':' - '):(val<0?'- ':''))+(a===1?'':a+' ')+'v'+k;}return s||'0';}
 asLP(objective,extra=[]){const lines=['Minimize',' obj: '+LPBuilder.expr(Object.entries(objective)),'Subject To'];
 const all=this.rows.concat(extra);all.forEach((r,i)=>{
  const expr=LPBuilder.expr(Object.entries(r.terms));
  if(expr==='0'){
    if(r.lo>0||r.hi<0)throw Error('Ràng buộc không khả thi.');
    return; // Drop tautological constant-only rows: portable CPLEX LP parsers reject them.
  }
  if(Number.isFinite(r.lo)&&Number.isFinite(r.hi)&&r.lo===r.hi)lines.push(' c'+i+': '+expr+' = '+r.lo);
  else {if(Number.isFinite(r.lo))lines.push(' c'+i+'l: '+expr+' >= '+r.lo);if(Number.isFinite(r.hi))lines.push(' c'+i+'h: '+expr+' <= '+r.hi);}
 });
 lines.push('Bounds');this.cols.forEach((c,i)=>lines.push(' '+c.lo+' <= v'+i+' <= '+c.hi));
 lines.push('Generals');for(let i=0;i<this.cols.length;i+=24)lines.push(' '+this.cols.slice(i,i+24).map(c=>c.name).join(' '));lines.push('End');return lines.join('\n');
 }
 solve(objective,extra,solver,timeLimit=65){const lp=this.asLP(objective,extra);const result=solver(lp,{output_flag:false,time_limit:timeLimit,mip_rel_gap:0});
  if(result.Status!=='Optimal')throw Error('HiGHS chưa chứng minh được nghiệm tối ưu ('+result.Status+'). Không tạo lịch suy đoán.');
  return this.cols.map((c,i)=>{const x=result.Columns?.[c.name]?.Primal;if(!Number.isFinite(x)||Math.abs(x-Math.round(x))>1e-4)throw Error('Nghiệm không nguyên: '+c.name);return Math.round(x);});
 }
}
const put=(o,k,v)=>{if(v)o[k]=v;};
function groupTransactions(transactions,daily){
 const m=new Map();for(const t of transactions){if(!m.has(t.date))m.set(t.date,[]);m.get(t.date).push(t);}
 const rows=[];for(const day of daily){const txs=m.get(day.date);if(!txs)continue;
 let qs=0,sg=0,sp=0,qe=0,qg=0,gain=0,gt=0,core=0,bonus=0;const events=[];
 for(const t of txs){sg+=t.silver_gained;sp+=t.silver_used;gain+=t.gold_gained;
  if(t.type==='Đổi bạc')qs+=t.quartz_used;
  else if(t.type==='Mua vàng'){qg+=t.quartz_used;gt+=t.gold_times||0;}
  else if(t.type.startsWith('Mua ')){qe+=t.quartz_used;if(t.type==='Mua Cốt lõi')core+=(t.quartz_used+t.silver_used)/5000;if(t.type==='Mua Chợ bổ sung')bonus+=t.silver_used/10000;}
  if(t.event&&!events.includes(t.event))events.push(t.event);
 }
 const labels=[];if(qs)labels.push('Đổi bạc');labels.push(...events);if(qg)labels.push('Mua vàng');
 rows.push({date:day.date,event:events.join('; ')||'·',action:labels.join(' + ')||'·',quartz_income:day.quartz_income,quartz_to_silver:qs,silver_gained:sg,silver_spent:sp,quartz_event_spent:qe,quartz_to_gold:qg,gold_times:gt,gold_gained:gain,quartz_end:day.quartz_balance,silver_end:day.silver_balance,core_units:core,bonus_units:bonus,transaction_count:txs.length,details:txs});
 }
 return rows;
}
function optimize(raw,solver){
 const d=validate(raw),group=weeksFor(d),weeks=group.weeks,days=Array.from({length:dateDiff(d.end_date,d.start_date)+1},(_,i)=>addDays(d.start_date,i));
 const months=[...new Set(days.map(x=>x.slice(0,7)))],dayIds=new Map(days.map((x,i)=>[x,i]));
 const deadlineIndex=weeks.map(w=>dayIds.get(w.deadline)),mondays=new Map(group.all.map(w=>[w.date,w]));
 const earned=days.map(x=>1176+(weekday(x)<6?9000:0)+(mondays.get(x)?.reward_boss||0));
 const model=new LPBuilder(),core=weeks.map((w,i)=>model.add('core'+i,0,w.core_units-w.core_before)),full=weeks.map((w,i)=>model.add('full'+i,0,1));
 const extras=new Map(),silver=new Map(),gold=new Map();
 weeks.forEach((w,i)=>{if(w.event==='Chợ lấp lánh')extras.set(i,model.add('extra'+i,0,15-w.bonus_before));});
 days.forEach((x,j)=>{if([0,5,6].includes(weekday(x))||x.slice(8)==='01'||x===monthEnd(x)||x===d.end_date||x===d.start_date)silver.set(j,model.add('silver'+x,0,50));});
 months.forEach(m=>gold.set(m,model.add('gold'+m,0,24-(m===d.start_date.slice(0,7)?d.gold_used_month:0))));
 weeks.forEach((w,i)=>{model.rule({[core[i]]:1,[full[i]]:-(w.core_units-w.core_before)},0,Infinity);if(extras.has(i))model.rule({[extras.get(i)]:1,[full[i]]:-(15-w.bonus_before)},-Infinity,0);});
 months.forEach(m=>{const terms={};for(const [j,v] of silver)if(days[j].startsWith(m))terms[v]=1;model.rule(terms,-Infinity,Math.floor((250000-(m===d.start_date.slice(0,7)?d.silver_used_month:0))/5000));});
 const due=new Map();deadlineIndex.forEach((j,i)=>{if(!due.has(j))due.set(j,[]);due.get(j).push(i);});
 let inc=0,qterms={},sterms={};
 days.forEach((x,j)=>{
  inc+=earned[j];if(silver.has(j)){qterms[silver.get(j)]=-5000;sterms[silver.get(j)]=5000;}
  for(const i of due.get(j)||[]){if(weeks[i].kind==='quartz')qterms[core[i]]=-5000;else sterms[core[i]]=-5000;if(extras.has(i))sterms[extras.get(i)]=-10000;}
  if(x===monthEnd(x)||x===d.end_date)qterms[gold.get(x.slice(0,7))]=-5000;
  model.rule(qterms,-d.initial_quartz-inc,Infinity);model.rule(sterms,-d.initial_silver,Infinity);
 });
 const objs=[Object.fromEntries(full.map(v=>[v,-1])),Object.fromEntries(core.map(v=>[v,-1])),Object.fromEntries([...extras.values()].map(v=>[v,-1])),Object.fromEntries([...gold.values()].map(v=>[v,-1]))];
 let extra=[],stages=[],sol=null;
 objs.forEach(o=>{
  if(Object.keys(o).length)sol=model.solve(o,extra,solver);
  const score=-Object.entries(o).reduce((a,[k,v])=>a+sol[k]*v,0)||0;
  stages.push(score);
  if(Object.keys(o).length)extra.push({terms:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,-v])),lo:score,hi:score});
 });
 // NEW v6.1 PRIORITY: earliest Market first, without sacrificing any of the
 // four already-certified objective levels (full core events, core units,
 // Market extras, total gold). This is an *exact* lexicographic tie-break,
 // not a weighted sum which could trade a high-priority result for a lower one.
 // Markets appear in chronological order because `weeks` does.
 const earlyMarketPriority=[];
 const orderedMarkets=[...extras.entries()];
 for(const [eventIndex,variable] of orderedMarkets){
  // A feasible, certified solution already attaining the universal upper bound
  // (15) PROVES this Market is maximal. In that case no new MILP solve is needed.
  if(sol[variable]!==15-weeks[eventIndex].bonus_before){
   sol=model.solve({[variable]:-1},extra,solver,65);
  }
  const bought=sol[variable];
  if(!Number.isInteger(bought)||bought<0||bought>15-weeks[eventIndex].bonus_before)throw Error('Lượt Chợ ưu tiên không hợp lệ.');
  extra.push({terms:{[variable]:1},lo:bought,hi:bought});
  earlyMarketPriority.push({event_index:eventIndex+1,date:weeks[eventIndex].event_start,bought:bought+weeks[eventIndex].bonus_before,missed:15-bought-weeks[eventIndex].bonus_before});
 }
 // Only after fixing every earlier Market may we prefer earlier gold purchases.
 // This optional financial scheduling tie-break cannot change bonus positions.
 const earlier=Object.fromEntries(months.map((m,i)=>[gold.get(m),-(months.length-i)]));
 try{sol=model.solve(earlier,extra,solver,20);}catch(e){/* Keep certified solution, including chronological Market priority. */}
 // Recheck every fixed higher-priority score after the final scheduling pass.
 if(stages[0]!==full.reduce((a,j)=>a+sol[j],0)||
    stages[1]!==core.reduce((a,j)=>a+sol[j],0)||
    stages[2]!==orderedMarkets.reduce((a,[,j])=>a+sol[j],0)||
    stages[3]!==[...gold.values()].reduce((a,j)=>a+sol[j],0)||
    earlyMarketPriority.some(x=>sol[extras.get(x.event_index-1)]+weeks[x.event_index-1].bonus_before!==x.bought)){
  throw Error('Lịch sau ưu tiên Chợ làm thay đổi kết quả tối ưu cấp cao.');
 }
 let q=d.initial_quartz,s=d.initial_silver,goldTotal=0;const daily=[];
 days.forEach((day,j)=>{
  const m=day.slice(0,7),b=mondays.get(day),boss=b?.reward_boss||0,mission=weekday(day)<6?9000:0;
  q+=earned[j];let sx=silver.has(j)?sol[silver.get(j)]*5000:0;q-=sx;s+=sx;
  let sc=0,qc=0;for(const i of due.get(j)||[]){const c=sol[core[i]]*5000,bonus=extras.has(i)?sol[extras.get(i)]*10000:0;if(weeks[i].kind==='quartz')qc+=c;else sc+=c+bonus;}
  q-=qc;s-=sc;const gt=(day===monthEnd(day)||day===d.end_date)?sol[gold.get(m)]:0;q-=gt*5000;goldTotal+=gt*500;
  daily.push({date:day,month:m,weekday:weekday(day),boss,mission,workshop:1176,quartz_income:earned[j],silver_exchanged:sx,gold_times:gt,gold_gained:gt*500,event_silver:sc,event_quartz:qc,quartz_balance:q,silver_balance:s});
  if(q<0||s<0)throw Error('Âm tài nguyên tại '+day);
 });
 const balances={quartz:daily.map(r=>r.quartz_balance),silver:daily.map(r=>r.silver_balance)},purchases=[];
 weeks.forEach((w,i)=>{
  const begin=dayIds.get(w.first_buy_day),end=deadlineIndex[i];
  for(const [cat,cost,count,resource] of [['Cốt lõi',5000,sol[core[i]],w.kind],['Chợ bổ sung',10000,extras.has(i)?sol[extras.get(i)]:0,'silver']]){
   for(let n=0;n<count;n++){
    const sat=Math.max(begin,Math.min(end,dateDiff(addDays(w.date,5),d.start_date))); let order=d.completion_mode==='sunday'?[end]:d.completion_mode==='auto'?[sat,...Array.from({length:sat-begin},(_,k)=>begin+k),...Array.from({length:end-sat},(_,k)=>sat+k+1)]:Array.from({length:end-begin+1},(_,k)=>begin+k);
    let chosen=end;for(const j of order){if(j===end||Math.min(...balances[resource].slice(j,end))>=cost){chosen=j;break;}}
    purchases.push({date:days[chosen],event_index:w.index,event:w.event,category:cat,resource,cost});
    for(let j=chosen;j<end;j++)balances[resource][j]-=cost;
   }
  }
 });
 const byDate=new Map();for(const p of purchases){if(!byDate.has(p.date))byDate.set(p.date,[]);byDate.get(p.date).push(p);}
 daily.forEach((r,j)=>{r.event_silver=(byDate.get(r.date)||[]).filter(p=>p.resource==='silver').reduce((a,b)=>a+b.cost,0);r.event_quartz=(byDate.get(r.date)||[]).filter(p=>p.resource==='quartz').reduce((a,b)=>a+b.cost,0);r.quartz_balance=balances.quartz[j];r.silver_balance=balances.silver[j];if(r.quartz_balance<0||r.silver_balance<0)throw Error('Âm tài nguyên khi mua sớm '+r.date);});
 for(const p of purchases){const w=weeks[p.event_index-1];if(p.date<w.event_start||p.date>w.deadline||weekday(p.date)===0||(w.event==='Trường bắn đoạt bảo'&&weekday(p.date)===6))throw Error('Giao dịch ngoài thời gian sự kiện.');}
 const transactions=[];let qr=d.initial_quartz,sr=d.initial_silver;
 for(const r of daily){qr+=r.quartz_income;const day=r.date;
  if(r.silver_exchanged){const x=r.silver_exchanged;qr-=x;sr+=x;transactions.push({date:day,moment:'Sau thu nhập trong ngày',type:'Đổi bạc',quartz_used:x,silver_used:0,silver_gained:x,gold_gained:0,quartz_left:qr,silver_left:sr});}
  for(const p of byDate.get(day)||[]){if(p.resource==='silver')sr-=p.cost;else qr-=p.cost;transactions.push({date:day,moment:'Trong thời gian sự kiện',type:'Mua '+p.category,event:p.event,quartz_used:p.resource==='quartz'?p.cost:0,silver_used:p.resource==='silver'?p.cost:0,silver_gained:0,gold_gained:0,quartz_left:qr,silver_left:sr});}
  if(r.gold_times){const x=r.gold_times*5000;qr-=x;transactions.push({date:day,moment:'Cuối ngày, trước reset',type:'Mua vàng',quartz_used:x,silver_used:0,silver_gained:0,gold_gained:r.gold_gained,gold_times:r.gold_times,quartz_left:qr,silver_left:sr});}
  if(qr!==r.quartz_balance||sr!==r.silver_balance||qr<0||sr<0)throw Error('Lệch đối soát ngày '+day);
 }
 const events=weeks.map((w,i)=>{
  const ps=purchases.filter(p=>p.event_index===w.index),last=daily[deadlineIndex[i]],spent_s=ps.filter(p=>p.resource==='silver').reduce((a,p)=>a+p.cost,0),spent_q=ps.filter(p=>p.resource==='quartz').reduce((a,p)=>a+p.cost,0);
  const begin=Math.max(0,dateDiff(w.date,d.start_date)),rows=daily.slice(begin,deadlineIndex[i]+1);
  return {...w,core_bought:sol[core[i]]+w.core_before,core_planned:sol[core[i]],core_complete:sol[core[i]]+w.core_before===w.core_units,bonus_bought:extras.has(i)?sol[extras.get(i)]+w.bonus_before:0,bonus_planned:extras.has(i)?sol[extras.get(i)]:0,bonus_missed:extras.has(i)?15-sol[extras.get(i)]-w.bonus_before:0,bonus_reason:extras.has(i)&&sol[extras.get(i)]+w.bonus_before<15?'Giới hạn tài nguyên/hạn mức sau khi ưu tiên sự kiện cốt lõi, tổng lượt Chợ và tổng vàng. Các Chợ sớm đã được ưu tiên trước.':'',silver_spent:spent_s,quartz_spent:spent_q,quartz_after_event:last.quartz_balance,silver_after_event:last.silver_balance,completion_date:ps.length?ps.reduce((a,p)=>p.date>a?p.date:a,ps[0].date):null,purchase_days:new Set(ps.map(p=>p.date)).size,mission_income:rows.reduce((a,r)=>a+r.mission,0),workshop_income:rows.reduce((a,r)=>a+r.workshop,0),income_total:rows.reduce((a,r)=>a+r.quartz_income,0)};
 });
 const monthly=months.map(m=>{
  const rows=daily.filter(r=>r.month===m),evs=events.filter(e=>e.date.startsWith(m)),end=rows[rows.length-1],sx=rows.reduce((a,r)=>a+r.silver_exchanged,0),gt=rows.reduce((a,r)=>a+r.gold_times,0);
  return {month:m,quartz_income:rows.reduce((a,r)=>a+r.quartz_income,0),silver_exchanged:sx,gold_times:gt,gold_gained:gt*500,core_complete:evs.filter(e=>e.core_complete).length,core_total:evs.length,market_bonus:evs.reduce((a,e)=>a+e.bonus_bought,0),silver_spent:rows.reduce((a,r)=>a+r.event_silver,0),quartz_spent:rows.reduce((a,r)=>a+r.event_quartz,0),silver_quota_left:250000-(m===d.start_date.slice(0,7)?d.silver_used_month:0)-sx,gold_quota_left:24-(m===d.start_date.slice(0,7)?d.gold_used_month:0)-gt,quartz_end:end.quartz_balance,silver_end:end.silver_balance};
 });
 const qt=earned.reduce((a,v)=>a+v,0),sx=monthly.reduce((a,r)=>a+r.silver_exchanged,0),qs=monthly.reduce((a,r)=>a+r.quartz_spent,0),ss=monthly.reduce((a,r)=>a+r.silver_spent,0),gt=monthly.reduce((a,r)=>a+r.gold_times,0),end=daily[daily.length-1];
 if(end.quartz_balance!==d.initial_quartz+qt-sx-qs-gt*5000||end.silver_balance!==d.initial_silver+sx-ss||monthly.some(m=>m.gold_quota_left<0||m.silver_quota_left<0))throw Error('Lỗi đối soát tổng hoặc hạn mức.');
 const totals={initial_quartz:d.initial_quartz,initial_silver:d.initial_silver,income_quartz:qt,quartz_total:d.initial_quartz+qt,core_complete:events.filter(e=>e.core_complete).length,core_total:events.length,core_units_bought:events.reduce((a,e)=>a+e.core_bought,0),core_units_max:events.reduce((a,e)=>a+e.core_units,0),bonus_bought:events.reduce((a,e)=>a+e.bonus_bought,0),bonus_max:events.filter(e=>e.event==='Chợ lấp lánh').length*15,silver_exchanged:sx,gold_times:gt,gold_gained:gt*500,quartz_event_spent:qs,silver_event_spent:ss,quartz_end:end.quartz_balance,silver_end:end.silver_balance,note:'Bộ giải HiGHS WebAssembly offline. Ưu tiên các Chợ lấp lánh sớm nhất trong các nghiệm có cùng số lượt cốt lõi, lượt Chợ và tổng vàng. Sự kiện mở thứ Ba; Trường bắn kết thúc thứ Bảy; sự kiện khác Chủ nhật. Thời gian kế hoạch tùy chọn.'};
 const boss_entries=d.boss_entries;const input=Object.fromEntries(Object.entries(d).filter(([k])=>k!=='boss_entries'));
 return {input,boss_entries,totals,events,months:monthly,transactions,transaction_days:groupTransactions(transactions,daily),purchases,checkpoints:daily,daily,stages,period:{start:d.start_date,end:d.end_date,days:days.length,snapshot:'start_of_day'},early_market_priority:earlyMarketPriority,priority_rule:'core > total market bonus > total gold > earliest market > scheduling',months_count:months.length};
}
root.KhoangThachSolver={optimize,reward,validate,weeksFor,LPBuilder};
if(typeof module==='object'&&module.exports)module.exports=root.KhoangThachSolver;
})(typeof self!=='undefined'?self:globalThis);
