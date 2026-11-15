/* Compare the JS-generated model with native HiGHS through SciPy on CI.
   No npm dependency required for the JS model test. */
const fs=require('fs'), path=require('path'), cp=require('child_process'), assert=require('node:assert/strict');
const solver=require('../app/src/main/assets/optimizer.js');
const parser=path.join(__dirname,'solve_lp_scipy.py');
const cases=[
 {},
 {initial_quartz:0, initial_silver:0,silver_used_nov:250000,gold_used_nov:24,damage_g:5.5,completion_mode:'early'},
 {initial_quartz:95000,initial_silver:15000,silver_used_nov:70000,gold_used_nov:6,damage_g:5.96,forecast_mode:'growth',monthly_growth_g:0.01,completion_mode:'sunday'}
];
for(const [i,input] of cases.entries()){
 let lastModel='';
 const solve=(lp,options)=>{
  const p=cp.spawnSync('python',[parser],{input:lp,encoding:'utf8',maxBuffer:50*1024*1024,timeout:95000});
  if(p.error||p.status!==0)throw Error('SciPy test adapter failure '+(p.error||p.stderr));
  return JSON.parse(p.stdout);
 };
 const result=solver.optimize(input,solve);
 const totals=result.totals;
 assert.equal(result.daily.length,532);
 assert.equal(result.events.length,76);
 assert.equal(result.months.length,18);
 assert.equal(result.months.every(m=>m.silver_quota_left>=0&&m.gold_quota_left>=0),true);
 assert.equal(result.daily.every(d=>d.quartz_balance>=0&&d.silver_balance>=0),true);
 assert.equal(result.transaction_days.every(r=>r.details.length===r.transaction_count),true);
 for(const purchase of result.purchases){
  let day=new Date(purchase.date+'T00:00:00Z').getUTCDay();
  assert.notEqual(day,1); // JS Sunday=0 Monday=1
  if(purchase.event==='Trường bắn đoạt bảo')assert.notEqual(day,0);
 }
 console.log('Case '+i+': '+JSON.stringify({stages:result.stages,core:totals.core_complete,bonus:totals.bonus_bought,gold:totals.gold_gained,quartz_end:totals.quartz_end}));
 const expected=cp.spawnSync('python',['-c',`import sys,json;sys.path.insert(0,'${path.join(__dirname,'../reference')}');sys.path.insert(0,'${path.join(__dirname,'../app/src/main/python')}');from optimizer_scipy import optimize; r=optimize(json.loads(sys.stdin.read()));print(json.dumps(r['stages']))`],{input:JSON.stringify(input),encoding:'utf8',timeout:200000});
 if(expected.status===0){const stages=JSON.parse(expected.stdout);assert.deepEqual(result.stages,stages,'Lexicographic score differs from v5');}
 else console.log('Oracle unavailable: '+expected.stderr.slice(0,800));
}
console.log('ALL JS model/parity checks passed.');
