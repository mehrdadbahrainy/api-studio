const {test} = require('node:test');
const assert = require('node:assert/strict');
const {initialWorkspace, freshRequest} = require('../.test-dist/models.js');
const {parseWorkspace} = require('../.test-dist/workspace-utils.js');

test('restore rejects over-capacity collections instead of silently discarding data', () => {
  const workspace = initialWorkspace();
  workspace.collections = Array.from({length:151}, (_,i) => ({id:'c'+i,name:'Collection '+i,requests:[]}));
  assert.throws(() => parseWorkspace(workspace), /too many collections/i);
});
test('restore rejects over-capacity environments instead of silently discarding data', () => {
  const workspace = initialWorkspace();
  workspace.environments = Array.from({length:81}, (_,i) => ({id:'e'+i,name:'Environment '+i,variables:[]}));
  assert.throws(() => parseWorkspace(workspace), /too many environments/i);
});
test('restore rejects duplicate collection and request identities before edits can overwrite them', () => {
  const workspace = initialWorkspace();
  workspace.collections.push({...workspace.collections[0],requests:[]});
  assert.throws(() => parseWorkspace(workspace), /duplicate collection/i);
  workspace.collections.pop();
  const request = freshRequest();
  request.id = workspace.collections[0].requests[0].id;
  workspace.collections.push({id:'other',name:'Other',requests:[request]});
  assert.throws(() => parseWorkspace(workspace), /duplicate request/i);
});
test('history entries do not consume the saved-request capacity on restart', () => {
  const workspace=initialWorkspace();
  const sample=workspace.collections[0].requests[0];
  workspace.collections[0].requests=Array.from({length:2000},(_,i)=>({...sample,id:'r'+i}));
  workspace.history=[{id:'history',at:'2026-11-20',request:sample,status:200,durationMs:1}];
  assert.equal(parseWorkspace(workspace).collections[0].requests.length,2000);
});
