const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialWorkspace}=require('../.test-dist/models.js');
const {parseWorkspace}=require('../.test-dist/workspace-utils.js');
const {parseScenarios}=require('../.test-dist/scenario-storage.js');
function valid(){const w=initialWorkspace(),id=w.collections[0].requests[0].id;return {
 id:'demo-scenario',name:'Demo',stopOnFailure:true,steps:[{
  id:'step-one',requestId:id,
  assertions:[{kind:'status-equals',expected:200},{kind:'json-exists',path:'$.data[0].id'}],
  extractions:[{source:'json',path:'$.token',variable:'token',secret:true}]
 }]
};}

test('legacy version 1 workspace with no scenarios remains compatible',()=>{
 const old=initialWorkspace();const after=parseWorkspace(old);
 assert.equal(after.scenarios,undefined);
 assert.equal(JSON.stringify(after).includes('scenarios'),false);
});
test('scenario definitions roundtrip with workspace version 1 and safe canonical keys',()=>{
 const w=initialWorkspace();const scenario=valid();
 w.scenarios=[scenario];
 const parsed=parseWorkspace(w);
 assert.equal(parsed.version,1);
 assert.deepEqual(parsed.scenarios,[scenario]);
 assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify(parsed))).scenarios,[scenario]);
});
test('extra fields holding runtime tokens, previous response and run results never persist',()=>{
 const s=valid();s.runtimeSecrets={token:'DO_NOT_KEEP_THIS_TOKEN'};
 s.steps[0].extractions[0].capturedValue='DO_NOT_KEEP_THIS_TOKEN';
 s.steps[0].assertions[0].responseText='DO_NOT_KEEP_THIS_TOKEN';
 const w=initialWorkspace();w.scenarios=[s];w.lastScenarioRun={password:'DO_NOT_KEEP_THIS_TOKEN'};
 const parsed=parseWorkspace(w);
 assert.equal(JSON.stringify(parsed).includes('DO_NOT_KEEP_THIS_TOKEN'),false);
 assert.equal(JSON.stringify(w).includes('DO_NOT_KEEP_THIS_TOKEN'),true,'must not mutate source');
 const expected={id:s.id,name:s.name,stopOnFailure:s.stopOnFailure,steps:[{
   id:s.steps[0].id,requestId:s.steps[0].requestId,
   assertions:[{kind:'status-equals',expected:200},{kind:'json-exists',path:'$.data[0].id'}],
   extractions:[{source:'json',path:'$.token',variable:'token',secret:true}]
 }]};
 assert.deepEqual(parsed.scenarios[0],expected);
});
test('over capacity and invalid scenarios reject the entire restore rather than silently drop them',()=>{
 const w=initialWorkspace();
 w.scenarios=Array.from({length:101},(_,i)=>({...valid(),id:'s'+i}));
 assert.throws(()=>parseWorkspace(w),/at most 100/);
 w.scenarios=[{...valid(),steps:[]}];
 assert.throws(()=>parseWorkspace(w),/1 to 20/);
 w.scenarios=[valid(),valid()];
 assert.throws(()=>parseWorkspace(w),/Duplicate scenario/);
 w.scenarios='malformed';
 assert.throws(()=>parseWorkspace(w),/scenarios must be an array/);
});
test('malformed assertions, extractions and illegal identifiers cannot be loaded',()=>{
 const s=valid();
 for(const bad of [
  {...s,steps:[{...s.steps[0],assertions:[{kind:'js-eval',code:'alert(1)'}]}]},
  {...s,steps:[{...s.steps[0],extractions:[{source:'json',path:'$.token',variable:'__proto__'}]}]},
  {...s,steps:[{...s.steps[0],assertions:[{kind:'json-equals',path:'$.token',expected:{secret:'object'}}]}]},
  {...s,steps:[{...s.steps[0],extractions:[{source:'json',path:'$.__proto__.x()',variable:'token'}]}]},
 ]) {
  const original=JSON.stringify(bad);
  assert.throws(()=>parseScenarios([bad]));
  assert.equal(JSON.stringify(bad),original);
 }
});
test('scenario storage keeps references without executing or mutating any HTTP request',()=>{
 const w=initialWorkspace();
 const r=w.collections[0].requests[0];
 const scenario=valid();scenario.steps[0].requestId=r.id;
 w.scenarios=[scenario];
 const before=JSON.stringify(r);
 const parsed=parseWorkspace(w);
 assert.equal(parsed.scenarios[0].steps[0].requestId,r.id);
 assert.equal(JSON.stringify(r),before);
 assert.equal(parsed.scenarios[0].steps[0].extractions[0].variable,'token');
});
