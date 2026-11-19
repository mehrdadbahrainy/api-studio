const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialWorkspace}=require('../.test-dist/models.js');
const {parseWorkspace}=require('../.test-dist/workspace-utils.js');
const {ensureFolderPath,folderBreadcrumb,collectionNavigation}=require('../.test-dist/folder-utils.js');
test('nested folder structure can be created and reused without duplicate directories',()=>{
  let folders=[];
  const first=ensureFolderPath(folders,['Team','Services','Billing']);
  folders=first.folders;
  assert.equal(folders.length,3);
  assert.equal(folderBreadcrumb(folders,first.id),'Team / Services / Billing');
  const second=ensureFolderPath(folders,['Team','Services','Billing']);
  assert.equal(second.id,first.id);assert.equal(second.folders.length,3);
});
test('folders are optional in v1 backups and roundtrip without altering requests',()=>{
  const old=initialWorkspace();const legacy=parseWorkspace(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(legacy.collections.map(c=>c.name),old.collections.map(c=>c.name));
  const created=ensureFolderPath([],['APIs','Payments']);
  old.folders=created.folders;old.collections[0].folderId=created.id;
  const restored=parseWorkspace(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.folders.length,2);
  assert.equal(restored.collections[0].folderId,created.id);
  assert.equal(restored.collections[0].requests[0].name,'Get a sample TODO');
});
test('cyclic and invalid folders fail closed rather than hanging',()=>{
  const w=initialWorkspace();
  w.folders=[{id:'one',name:'A',parentId:'two'},{id:'two',name:'B',parentId:'one'}];
  assert.throws(()=>parseWorkspace(w),/cyclic/);
  w.folders=[{id:'one',name:'A',parentId:'not-here'}];
  assert.throws(()=>parseWorkspace(w),/invalid/);
});
test('folder tree shows hierarchy and filtering reveals matching requests',()=>{
  const w=initialWorkspace(),plan=ensureFolderPath([],['Team','Orders']);
  w.folders=plan.folders;w.collections[0].folderId=plan.id;
  const nav=collectionNavigation(w,'',new Set());
  assert.deepEqual(nav.map(x=>x.label),['Team','Orders','Getting started']);
  assert.deepEqual(nav.map(x=>x.depth),[0,1,2]);
  assert.deepEqual(collectionNavigation(w,'',new Set([plan.folders[0].id])).map(x=>x.label),['Team']);
  assert.deepEqual(collectionNavigation(w,'sample TODO',new Set([plan.folders[0].id])).map(x=>x.label),['Team','Orders','Getting started']);
});
