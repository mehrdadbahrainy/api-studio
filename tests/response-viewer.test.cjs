const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classifyResponse,responsePreview,responseFileName,MAX_RESPONSE_PREVIEW_CHARS}=require('../.test-dist/response-viewer.js');
const result=(body,contentType='application/json')=>({status:200,statusText:'OK',durationMs:15,sizeBytes:body.length,headers:[],body,contentType,binary:false});
test('classifies JSON, XML, HTML, text and binary payloads',()=>{
  assert.equal(classifyResponse('application/problem+json','{"message":"x"}'),'json');
  assert.equal(classifyResponse('application/soap+xml','<a/>'),'xml');
  assert.equal(classifyResponse('text/html','<html/>'),'html');
  assert.equal(classifyResponse('text/plain','ok'),'text');
  assert.equal(classifyResponse('text/plain','ignored',true),'binary');
});
test('pretty JSON view and raw view differ, with the exact source preserved',()=>{
  const input='{"key":[1,2],"active":true}',response=result(input);
  const pretty=responsePreview(response,'formatted'),raw=responsePreview(response,'raw');
  assert.equal(pretty.text,JSON.stringify(JSON.parse(input),null,2));
  assert.equal(raw.text,input);
  assert.equal(pretty.truncated,false);
});
test('HTML markup remains inert text: no script evaluation or DOM insertion',()=>{
  const response=result('<html><body><script>danger()</script><p>Safe</p></body></html>','text/html');
  const preview=responsePreview(response,'formatted');
  assert.equal(preview.kind,'html');
  assert.ok(preview.text.includes('<script>danger()</script>'));
  assert.equal(preview.text.includes('Safe'),true);
});
test('large responses are truncated only for the preview, never mutated',()=>{
  const text='x'.repeat(MAX_RESPONSE_PREVIEW_CHARS+250);
  const response=result(text,'text/plain'),preview=responsePreview(response,'formatted');
  assert.equal(preview.truncated,true);
  assert.equal(preview.text.length,MAX_RESPONSE_PREVIEW_CHARS);
  assert.equal(response.body.length,MAX_RESPONSE_PREVIEW_CHARS+250);
});
test('download filename uses the content type, not user-controlled path segments',()=>{
  const name=responseFileName(result('<a/>','application/xml'),new Date('2026-11-19T00:00:00Z'));
  assert.equal(name,'api-response-2026-11-19T00-00-00-000Z.xml');
});
