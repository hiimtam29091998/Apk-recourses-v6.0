const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path');
const solver=require('../app/src/main/assets/optimizer.js');
const lpScript=path.join(__dirname,'solve_lp_scipy.py');
const pyDir=path.resolve(__dirname,'../reference');
const cases=[
 {start_date:'2026-11-16',end_date:'2026-11-22',silver_used_month:70000,gold_used_month:6},
 {start_date:'2027-06-16',end_date:'2027-06-19',initial_quartz:35000,initial_silver:120000,silver_used_month:150000,ongoing_core_bought:1},
 {start_date:'2027-06-21',end_date:'2027-06-21',initial_quartz:80000,initial_silver:0,silver_used_month:0},
 {start_date:'2028-04-27',end_date:'2028-04-30',initial_quartz:150000,initial_silver:200000,ongoing_core_bought:3,ongoing_bonus_bought:5},
 {start_date:'2027-12-29',end_date:'2028-01-06',initial_quartz:155000,initial_silver:45000,silver_used_month:250000,gold_used_month:24,ongoing_core_bought:0}
];
const solve=lp=>{const run=cp.spawnSync('python',[lpScript],{input:lp,encoding:'utf8',maxBuffer:12*1024*1024,timeout:60000});if(run.status!==0)throw Error('SciPy LP adapter '+run.stderr);return JSON.parse(run.stdout);};
for(let i=0;i<cases.length;i++){
 const c=cases[i],a=solver.optimize(c,solve);
 const py=cp.spawnSync('python',['-c',`import json,sys;sys.path.insert(0,${JSON.stringify(pyDir)});from optimizer_dynamic import optimize;r=optimize(json.loads(sys.stdin.read()));print(json.dumps({'stages':r['stages'],'totals':r['totals'],'period':r['period'],'events':r['events']}))`],{input:JSON.stringify(c),encoding:'utf8',maxBuffer:12*1024*1024,timeout:60000});
 if(py.status!==0)throw Error('Desktop optimizer '+py.stderr);
 const b=JSON.parse(py.stdout);
 assert.deepEqual(a.stages,b.stages);assert.deepEqual(a.period,b.period);assert.equal(a.totals.bonus_bought,b.totals.bonus_bought);assert.equal(a.totals.gold_gained,b.totals.gold_gained);
 assert.equal(a.totals.quartz_end,b.totals.quartz_end);assert.equal(a.totals.silver_end,b.totals.silver_end);
 assert.deepEqual(a.events.map(x=>[x.core_bought,x.bonus_bought]),b.events.map(x=>[x.core_bought,x.bonus_bought]));
 assert(a.events.every(e=>e.bonus_bought<=12&&e.bonus_missed===(e.event==='Chợ lấp lánh'?12-e.bonus_bought:0)));
 assert.equal(a.totals.bonus_max,a.events.filter(e=>e.event==='Chợ lấp lánh').length*12);
 assert(a.daily.every(x=>x.quartz_balance>=0&&x.silver_balance>=0));
 assert(a.months.every(x=>x.silver_quota_left>=0&&x.gold_quota_left>=0));
 assert(a.purchases.every(p=>p.date>=a.period.start&&p.date<=a.period.end));
 if(c.ongoing_core_bought||c.ongoing_bonus_bought){let r=a.events[0];assert.equal(r.core_bought,r.core_planned+c.ongoing_core_bought);if(r.event==='Chợ lấp lánh')assert.equal(r.bonus_bought,r.bonus_planned+c.ongoing_bonus_bought);}
 console.log('case',i,'passed',a.period,a.stages,'balances',a.totals.quartz_end,a.totals.silver_end);
}
assert.equal(solver.validate({start_date:'2028-04-27',end_date:'2028-04-30',ongoing_bonus_bought:12}).ongoing_bonus_bought,12);
for(const bad of [
 {start_date:'2027-09-10',end_date:'2027-09-09'},
 {start_date:'2027-06-15',end_date:'2027-06-16',ongoing_core_bought:1},
 {start_date:'2028-04-27',end_date:'2028-04-30',ongoing_core_bought:7},
 {start_date:'2028-04-27',end_date:'2028-04-30',ongoing_bonus_bought:13},
 {start_date:'2027-05-01',end_date:'2027-05-02',silver_used_month:250001},
 {start_date:'2028-02-29',end_date:'2028-02-28'}
])assert.throws(()=>solver.validate(bad));
console.log('ALL V7 DYNAMIC ENGINE TESTS PASSED');
