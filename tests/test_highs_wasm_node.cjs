// End-to-end actual WASM test on GitHub Actions, before running Android Gradle.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const loadHighs=require('../app/src/main/assets/highs.js');
const optimizer=require('../app/src/main/assets/optimizer.js');
(async()=>{
 const highs=await loadHighs({locateFile: file=>path.join(__dirname,'../app/src/main/assets',file)});
 assert.equal(typeof highs.solve,'function');
 for(const [label,config,expected] of [
  ['default',{},[76,361,228,410]],
  ['low-income',{initial_quartz:0,initial_silver:0,silver_used_nov:250000,gold_used_nov:24,damage_g:5.5,completion_mode:'early'},[75,356,228,407]],
  ['tam-206k',{initial_quartz:9650,damage_g:5.92},[76,361,228,412]],
 ]) {
  const p=optimizer.optimize(config,(lp,opts)=>highs.solve(lp,opts));
  assert.deepEqual(p.stages,expected,`Mismatch in ${label}`);
  if(label==='default')fs.writeFileSync(path.join(__dirname,'example_js_result.json'),JSON.stringify(p));
  assert.equal(p.daily.length,532);assert.equal(p.totals.bonus_max,228);assert(p.events.every(e=>e.bonus_bought<=12));
  assert.equal(p.early_market_priority.length,19);
  if(label==='default'||label==='tam-206k'){assert.deepEqual(p.early_market_priority.map(x=>x.bought),Array(19).fill(12));}
  assert(p.daily.every(d=>d.quartz_balance>=0&&d.silver_balance>=0));
  assert(p.months.every(m=>m.silver_quota_left>=0&&m.gold_quota_left>=0));
  console.log('PASS',label,p.stages,p.totals.gold_gained);
 }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
