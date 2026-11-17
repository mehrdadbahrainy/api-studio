const {test} = require('node:test');
const assert = require('node:assert/strict');
const {MIN_SIDEBAR_WIDTH,MAX_SIDEBAR_WIDTH,DEFAULT_SIDEBAR_WIDTH,COLLAPSED_SIDEBAR_WIDTH,
  clampSidebarWidth,parseSidebarPreferences,readSidebarPreferences,writeSidebarPreferences,SIDEBAR_PREFS_KEY} = require('../.test-dist/sidebar-state.js');

test('sidebar width respects minimum, maximum and available main editor space',()=>{
  assert.equal(clampSidebarWidth(-100),MIN_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(900),MAX_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(500,780),390);
  assert.equal(clampSidebarWidth(Infinity),DEFAULT_SIDEBAR_WIDTH);
  assert.equal(COLLAPSED_SIDEBAR_WIDTH,68);
});

test('malformed and obsolete preferences never break startup',()=>{
  assert.equal(parseSidebarPreferences('{oops').width,DEFAULT_SIDEBAR_WIDTH);
  assert.equal(parseSidebarPreferences('{}').collapsed,false);
  assert.equal(parseSidebarPreferences(JSON.stringify({width:'oops',collapsed:'yes',collapsedCollectionIds:'bad'})).width,DEFAULT_SIDEBAR_WIDTH);
  assert.deepEqual(parseSidebarPreferences(JSON.stringify({collapsedCollectionIds:['abc','abc','',42,'def']})).collapsedCollectionIds,['abc','','def']);
});

test('UI preferences survive restart but do not store workspace secrets',()=>{
  const store = new Map();
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  writeSidebarPreferences(storage,{width:352,collapsed:true,collapsedCollectionIds:['sample-col']});
  assert.equal(store.size,1);
  assert.ok(store.has(SIDEBAR_PREFS_KEY));
  assert.equal(store.get(SIDEBAR_PREFS_KEY).includes('token'),false);
  assert.deepEqual(readSidebarPreferences(storage),{width:352,collapsed:true,collapsedCollectionIds:['sample-col']});
});

test('unavailable localStorage is nonfatal',()=>{
  const storage={getItem(){throw new Error('Blocked');},setItem(){throw new Error('QuotaExceededError');}};
  assert.equal(readSidebarPreferences(storage).width,DEFAULT_SIDEBAR_WIDTH);
  assert.doesNotThrow(()=>writeSidebarPreferences(storage,{width:282,collapsed:false,collapsedCollectionIds:[]}));
});

test('the initial Collection has a stable identity across unsaved fresh workspaces',()=>{
  const {initialWorkspace}=require('../.test-dist/models.js');
  const first=initialWorkspace(),next=initialWorkspace();
  assert.equal(first.collections[0].id,next.collections[0].id);
  assert.equal(first.collections[0].name,'Getting started');
});
