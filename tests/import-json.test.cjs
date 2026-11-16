const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialWorkspace, row } = require('../.test-dist/models.js');
const { parseImportedJson } = require('../.test-dist/import-json.js');
const { prepareRequest } = require('../.test-dist/request-utils.js');

const schema = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const collection = (item, other = {}) => ({
  info: {name:'Imported API',schema}, item, ...other
});

test('Postman v2.1 import adds collections without deleting existing requests or history', () => {
  const current = initialWorkspace();
  current.history.push({id:'old',at:'2026-01-01T00:00:00Z',request:current.collections[0].requests[0],status:200,durationMs:10});
  const serialized = JSON.stringify(current);
  const result = parseImportedJson(collection([{name:'User',request:{method:'GET',url:'https://example.test/users'}}]),current);
  assert.equal(result.kind,'postman-collection');
  assert.equal(result.importedRequests,1);
  assert.equal(result.importedCollections,1);
  assert.equal(result.workspace.collections.length,2);
  assert.equal(result.workspace.history.length,1);
  assert.equal(result.workspace.collections[0].name,'Getting started');
  assert.equal(JSON.stringify(current),serialized,'input workspace must not be modified');
});

test('Postman folders become uniquely named nested collection paths', () => {
  const result = parseImportedJson(collection([{
    name:'Users',item:[
      {name:'List',request:{method:'GET',url:'https://example.test/users'}},
      {name:'Admin',item:[{name:'Delete',request:{method:'DELETE',url:'https://example.test/users/1'}}]}
    ]
  }]),initialWorkspace());
  const groups=result.workspace.collections.slice(1);
  assert.deepEqual(groups.map(c=>c.name),['Imported API / Users','Imported API / Users / Admin']);
  assert.equal(groups[0].requests[0].name,'List');
  assert.equal(groups[1].requests[0].method,'DELETE');
});

test('raw URLs with a query array do not double-send parameters', () => {
  const result=parseImportedJson(collection([{name:'Search',request:{
    method:'GET',url:{raw:'https://example.test/search?q=hello%20world&other=1',
      query:[{key:'q',value:'hello world'},{key:'other',value:'1',disabled:true}]}
  }}]),initialWorkspace());
  const d=result.workspace.collections.at(-1).requests[0];
  const prepared=prepareRequest(d);
  const parsed=new URL(prepared.url);
  assert.deepEqual(parsed.searchParams.getAll('q'),['hello world']);
  assert.equal(parsed.searchParams.has('other'),false);
});

test('raw JSON, bearer auth and inherited collection auth survive import', () => {
  const result=parseImportedJson(collection([{name:'Create',request:{
    method:'POST',url:'https://example.test/orders',
    body:{mode:'raw',raw:'{"item":"abc"}',options:{raw:{language:'json'}}}
  }}],{auth:{type:'bearer',bearer:[{key:'token',value:'TEST_TOKEN'}]}}),initialWorkspace());
  const d=result.workspace.collections.at(-1).requests[0];
  assert.equal(d.bodyMode,'json');
  const p=prepareRequest(d);
  assert.equal(p.init.headers.get('authorization'),'Bearer TEST_TOKEN');
  assert.equal(p.init.body,'{"item":"abc"}');
});

test('nested folder auth overrides inherited collection auth', () => {
  const result=parseImportedJson(collection([{name:'Internal',auth:{type:'basic',
    basic:[{key:'username',value:'dev'},{key:'password',value:'pass'}]},
    item:[{name:'Ping',request:{method:'GET',url:'https://example.test/ping'}}]}],
    {auth:{type:'bearer',bearer:[{key:'token',value:'ignored'}]}}),initialWorkspace());
  const d=result.workspace.collections.at(-1).requests[0];
  assert.equal(d.authMode,'basic');
  assert.equal(d.basicUsername,'dev');
  assert.equal(d.bearerToken,'');
});

test('Postman API key auth is mapped to request header or query parameter', () => {
  const base={type:'apikey',apikey:[{key:'key',value:'X-API-Key'},{key:'value',value:'my-token'},{key:'in',value:'header'}]};
  const result=parseImportedJson(collection([{name:'One',request:{method:'GET',
    url:'https://example.test/one',auth:base}}]),initialWorkspace());
  assert.equal(prepareRequest(result.workspace.collections.at(-1).requests[0]).init.headers.get('X-API-Key'),'my-token');
});

test('disabled formdata entries are retained as disabled and file fields warn', () => {
  const result=parseImportedJson(collection([{name:'Upload',request:{method:'POST',
    url:'https://example.test/upload',body:{mode:'formdata',formdata:[
      {key:'title',value:'hello',type:'text'},
      {key:'disabled',value:'hidden',type:'text',disabled:true},
      {key:'attachment',type:'file',src:'/tmp/secret.txt'}
    ]}}}]),initialWorkspace());
  const d=result.workspace.collections.at(-1).requests[0];
  assert.equal(d.formData.length,2);
  assert.equal(d.formData[1].enabled,false);
  assert.ok(result.warnings.some(w=>w.includes('file-upload')));
  assert.equal(prepareRequest(d).init.body.get('title'),'hello');
  assert.equal(prepareRequest(d).init.body.get('disabled'),null);
});

test('URL-encoded fields keep Postman variables resolvable', () => {
  const r=parseImportedJson(collection([{name:'Login',request:{method:'POST',
    url:'https://example.test/login',body:{mode:'urlencoded',urlencoded:[
      {key:'username',value:'John Smith'},{key:'token',value:'{{token}}'}
    ]}}}]),initialWorkspace());
  const d=r.workspace.collections.at(-1).requests[0];
  const p=prepareRequest(d,{id:'env',name:'env',variables:[row('token','safe value')]});
  assert.equal(p.init.body,'username=John+Smith&token=safe+value');
});

test('Postman collection variables are imported into a separate active environment', () => {
  const current=initialWorkspace();
  const result=parseImportedJson(collection(
    [{name:'Get',request:{method:'GET',url:'https://example.test'}}],
    {variable:[{key:'baseUrl',value:'https://example.test',enabled:true}]}
  ),current);
  assert.equal(result.workspace.environments.length,current.environments.length+1);
  assert.equal(result.workspace.selectedEnvironmentId,result.workspace.environments.at(-1).id);
  assert.equal(result.workspace.environments.at(-1).variables[0].value,'https://example.test');
});

test('Postman environment import does not alter collections/history', () => {
  const current=initialWorkspace();
  const r=parseImportedJson({name:'Prod',_postman_variable_scope:'environment',
    values:[{key:'baseUrl',value:'https://example.test'},{key:'secret',value:'shh',enabled:false}]},current);
  assert.equal(r.kind,'postman-environment');
  assert.equal(r.workspace.collections,current.collections);
  assert.equal(r.workspace.environments.at(-1).variables[1].enabled,false);
});

test('native API Studio backup remains a replacement, not merge', () => {
  const backup=initialWorkspace();
  backup.collections[0].name='Restore Me';
  const r=parseImportedJson(JSON.parse(JSON.stringify(backup)),initialWorkspace());
  assert.equal(r.kind,'native');
  assert.equal(r.workspace.collections[0].name,'Restore Me');
});

test('invalid or unsupported JSON is rejected without touching existing workspace', () => {
  const current=initialWorkspace(), before=JSON.stringify(current);
  for(const value of [null,{},[],{info:{name:'X'},item:'broken'},
    {info:{name:'X',schema:'https://invalid.test/schema'},item:[]}]) {
    assert.throws(()=>parseImportedJson(value,current),/Unrecognized|Only Postman/);
  }
  assert.equal(JSON.stringify(current),before);
});

test('unsupported methods are skipped with a warning, scripts are never imported', () => {
  const r=parseImportedJson(collection([
    {name:'Unknown',request:{method:'TRACE',url:'https://example.test'}},
    {name:'Valid',event:[{listen:'test',script:{exec:['console.log("secret")']}}],
      request:{method:'GET',url:'https://example.test'}}
  ]),initialWorkspace());
  assert.equal(r.importedRequests,1);
  assert.ok(r.warnings.some(x=>x.includes('unsupported HTTP methods')));
  assert.ok(r.warnings.some(x=>x.includes('scripts are not imported')));
  assert.equal(JSON.stringify(r.workspace).includes('console.log'),false);
});

test('workspace capacity is enforced before any merge', () => {
  const current=initialWorkspace();
  const many=Array.from({length:2001},(_,i)=>({name:'Item '+i,request:{method:'GET',url:'https://example.test'}}));
  assert.throws(()=>parseImportedJson(collection(many),current),/limits/);
  assert.equal(current.collections.length,1);
});

test('overly nested Postman folders are rejected without mutation', () => {
  const current=initialWorkspace(), previous=JSON.stringify(current);
  let item={name:'Leaf',request:{method:'GET',url:'https://example.test'}};
  for(let i=0;i<25;i++)item={name:'folder-'+i,item:[item]};
  assert.throws(()=>parseImportedJson(collection([item]),current),/nesting/);
  assert.equal(JSON.stringify(current),previous);
});
