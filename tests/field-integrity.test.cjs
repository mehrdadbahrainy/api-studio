const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialWorkspace,row}=require('../.test-dist/models.js');
const {parseWorkspace}=require('../.test-dist/workspace-utils.js');
const {parseImportedJson}=require('../.test-dist/import-json.js');
for(const [field,limit] of [['name',160],['url',16000],['body',2000000],['bearerToken',10000],['basicUsername',1000],['basicPassword',10000]]){
  test(`saved ${field} at its limit roundtrips; over limit rejects without truncation`,()=>{
    const workspace=initialWorkspace(),request=workspace.collections[0].requests[0];
    request[field]='x'.repeat(limit);
    assert.equal(parseWorkspace(workspace).collections[0].requests[0][field],request[field]);
    request[field]+='x';const before=JSON.stringify(workspace);
    assert.throws(()=>parseWorkspace(workspace),/character workspace limit/);
    assert.equal(JSON.stringify(workspace),before);
  });
}
test('row values, keys and counts reject oversize input without dropping entries',()=>{
  const workspace=initialWorkspace();const request=workspace.collections[0].requests[0];
  request.headers=[row('x'.repeat(513),'test')];assert.throws(()=>parseWorkspace(workspace),/Row key/);
  request.headers=[row('key','x'.repeat(100001))];assert.throws(()=>parseWorkspace(workspace),/Row value/);
  request.headers=Array.from({length:201},(_,i)=>row('key'+i,'test'));assert.throws(()=>parseWorkspace(workspace),/too many rows/);
});
test('malformed request lists and duplicate environment identifiers fail closed',()=>{
  const workspace=initialWorkspace();workspace.collections[0].requests='invalid';
  assert.throws(()=>parseWorkspace(workspace),/requests must be an array/);
  workspace.collections[0].requests=[];workspace.environments.push({...workspace.environments[0]});
  assert.throws(()=>parseWorkspace(workspace),/Duplicate environment/);
});
test('Postman oversize bodies and row arrays reject before additive merge',()=>{
  const current=initialWorkspace(),before=JSON.stringify(current);
  const collection={info:{name:'QA'},item:[{name:'QA',request:{method:'POST',url:'http://127.0.0.1/echo',body:{mode:'raw',raw:'x'.repeat(2000001)}}}]};
  assert.throws(()=>parseImportedJson(collection,current),/Request body/);
  const env={name:'QA',values:Array.from({length:201},(_,i)=>({key:'v'+i,value:'test'}))};
  assert.throws(()=>parseImportedJson(env,current),/too many rows/);
  assert.equal(JSON.stringify(current),before);
});
