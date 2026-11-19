const {test}=require('node:test');
const assert=require('node:assert/strict');
const {freshRequest,initialWorkspace}=require('../.test-dist/models.js');
const {MAX_EDITOR_TABS,TAB_PREFS_KEY,parseTabPreferences,readTabPreferences,writeTabPreferences,
  resolveSavedTabIds,requestIsDirty}=require('../.test-dist/editor-tab-state.js');

test('restored tab preferences contain only saved request IDs and no secrets',()=>{
  const stored=new Map();
  const store={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  const prefs={requestIds:['request-1','request-2'],activeRequestId:'request-2'};
  writeTabPreferences(store,prefs);
  assert.deepEqual(readTabPreferences(store),prefs);
  const encoded=stored.get(TAB_PREFS_KEY);
  for(const secret of ['password','bearerToken','request body','https://'])assert.equal(encoded.includes(secret),false);
});

test('unknown, duplicate and oversize tab IDs are discarded',()=>{
  const ids=['id-1','id-1','',25,'a'.repeat(200),...Array.from({length:20},(_,i)=>'req-'+i)];
  const prefs=parseTabPreferences(JSON.stringify({requestIds:ids,activeRequestId:'missing'}));
  assert.equal(prefs.requestIds.length,MAX_EDITOR_TABS);
  assert.equal(prefs.activeRequestId,null);
  assert.equal(prefs.requestIds[0],'id-1');
  assert.deepEqual(parseTabPreferences('{bad').requestIds,[]);
  assert.deepEqual(parseTabPreferences(JSON.stringify({requestIds:'no'})).requestIds,[]);
});

test('restoring tabs skips requests deleted from the workspace',()=>{
  const workspace=initialWorkspace();
  const id=workspace.collections[0].requests[0].id;
  assert.deepEqual(resolveSavedTabIds(workspace,{requestIds:['missing',id],activeRequestId:id}),[id]);
});

test('dirty detection compares nested request fields and destination collection',()=>{
  const saved=freshRequest();saved.collectionId='a';
  assert.equal(requestIsDirty({...saved,headers:saved.headers.map(x=>({...x}))},saved,'a'),false);
  const changed={...saved,headers:saved.headers.map(x=>({...x}))};
  changed.headers[0].value='SECRET';
  assert.equal(requestIsDirty(changed,saved,'a'),true);
  assert.equal(requestIsDirty(saved,saved,'b'),true);
  assert.equal(requestIsDirty(saved,null,'a'),true);
});

test('missing and blocked preference storage never lose workspace data',()=>{
  const broken={getItem(){throw Error('blocked');},setItem(){throw Error('quota exceeded');}};
  assert.deepEqual(readTabPreferences(broken).requestIds,[]);
  assert.doesNotThrow(()=>writeTabPreferences(broken,{requestIds:['id'],activeRequestId:'id'}));
});

test('encrypted workspace parser retains only valid saved-tab IDs across restart',()=>{
  const {parseWorkspace}=require('../.test-dist/workspace-utils.js');
  const ws=initialWorkspace();
  const saved=ws.collections[0].requests[0];
  const second={...freshRequest(),collectionId:ws.collections[0].id,name:'Second tab'};
  ws.collections[0].requests.push(second);
  ws.openTabState={requestIds:[saved.id,second.id],activeRequestId:second.id};
  const protectedPayload=JSON.stringify(ws);
  const restored=parseWorkspace(JSON.parse(protectedPayload));
  assert.deepEqual(restored.openTabState,ws.openTabState);
  const malicious={...ws,openTabState:{requestIds:[saved.id,'missing',saved.id,'secret?token=bad'],activeRequestId:'missing'}};
  const cleaned=parseWorkspace(malicious);
  assert.deepEqual(cleaned.openTabState,{requestIds:[saved.id],activeRequestId:null});
  const old=JSON.parse(protectedPayload);delete old.openTabState;
  assert.equal(parseWorkspace(old).openTabState,undefined);
});
