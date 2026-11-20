import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const key='api-studio.workspace.v1';
async function importJson(page,data){
  await page.getByRole('button',{name:'Workspace actions'}).click();
  await page.locator('.import-choice input[type=file]').setInputFiles({name:'qa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
for(const version of ['2.0','2.1']){
  test(`Postman ${version} nested import survives reload and stays additive`,async({page})=>{
    await page.goto('/');
    page.on('dialog',d=>d.accept());
    await importJson(page,{info:{name:'QA '+version,schema:`https://schema.getpostman.com/json/collection/v${version}.0/collection.json`},item:[{name:'Nested',item:[{name:'Fake request',request:{method:'GET',url:'http://127.0.0.1:4311/echo'}}]}]});
    await expect(page.locator('.toast')).toContainText('Postman collection imported');
    await expect(page.getByTitle('Getting started').locator('span')).toBeVisible();
    await page.reload();
    await expect(page.locator('.request-nav').filter({hasText:'Fake request'})).toBeVisible();
  });
}
test('Postman environment import persists variables without changing saved requests',async({page})=>{
  await page.goto('/');
  page.on('dialog',d=>d.accept());
  await importJson(page,{name:'QA environment',_postman_variable_scope:'environment',values:[{key:'baseUrl',value:'http://127.0.0.1:4311',enabled:true}]});
  await expect(page.locator('.toast')).toContainText('Postman environment added');
  await page.reload();
  await page.getByRole('textbox',{name:'Request URL'}).fill('{{baseUrl}}/echo?imported=yes');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.response-code')).toContainText('"imported": "yes"');
});
test('oversize backup rejects before confirmation and preserves current workspace',async({page})=>{
  await page.goto('/');
  let prompted=false;page.on('dialog',d=>{prompted=true;return d.dismiss();});
  await importJson(page,{version:1,collections:Array.from({length:151},(_,i)=>({id:'c'+i,name:'c'+i,requests:[]})),environments:[]});
  await expect(page.getByRole('alert')).toContainText('too many collections');
  expect(prompted).toBe(false);
  await expect(page.locator('.request-nav')).toHaveCount(1);
});
test('backup with duplicate saved request IDs rejects and keeps saved data',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const original=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const backup=structuredClone(original);
  backup.collections.push({id:'other',name:'Other',requests:[{...backup.collections[0].requests[0]}]});
  await importJson(page,backup);
  await expect(page.getByRole('alert')).toContainText('Duplicate request');
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).collections,key)).toEqual(original.collections);
});
test('collection capacity cannot create an unreopenable workspace',async({page})=>{
  await page.addInitScript(k=>localStorage.setItem(k,JSON.stringify({version:1,collections:Array.from({length:150},(_,i)=>({id:'c'+i,name:'c'+i,requests:[]})),environments:[],selectedEnvironmentId:null,history:[]})),key);
  await page.goto('/');
  await page.getByRole('button',{name:'New collection'}).click();
  await page.getByPlaceholder('Collection name').fill('Overflow');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await expect(page.locator('.toast')).toContainText('150 collections');
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).collections.length,key)).toBe(150);
});
test('twelve tab limit gives feedback and preserves existing drafts',async({page})=>{
  await page.goto('/');
  for(let i=0;i<11;i++)await page.getByRole('button',{name:'Open new request tab'}).click();
  await expect(page.getByRole('tablist',{name:'Open requests'}).getByRole('tab')).toHaveCount(12);
  await page.getByRole('button',{name:'Open new request tab'}).click();
  await expect(page.locator('.toast')).toContainText('12 tab limit');
  await expect(page.getByRole('tablist',{name:'Open requests'}).getByRole('tab')).toHaveCount(12);
});
test('keyboard new, save, send and close use the active request',async({page})=>{
  await page.goto('/');
  await page.keyboard.press('Control+n');
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Untitled request');
  await page.getByRole('textbox',{name:'Request URL'}).fill('http://127.0.0.1:4311/echo?shortcut=yes');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.toast')).toContainText('Request saved');
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.response-code')).toContainText('"shortcut": "yes"');
  await page.keyboard.press('Control+w');
  await expect(page.getByRole('tablist',{name:'Open requests'}).getByRole('tab')).toHaveCount(1);
});
test('collection deletion requires confirmation and reload preserves unrelated data',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'New collection'}).click();
  await page.getByPlaceholder('Collection name').fill('Disposable QA');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Delete Disposable QA',exact:true}).click();
  await expect(page.getByTitle('Disposable QA').locator('span')).toBeVisible();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Delete Disposable QA',exact:true}).click();
  await expect(page.getByTitle('Disposable QA')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.request-nav').filter({hasText:'Get a sample TODO'})).toBeVisible();
});
test('removing a parent folder retains nested folder and saved requests',async({page})=>{
  await page.goto('/');
  page.once('dialog',d=>d.accept('QA parent / QA child'));
  await page.getByRole('button',{name:'New folder'}).click();
  page.once('dialog',d=>d.accept('QA parent / QA child'));
  await page.getByRole('button',{name:'Move collection Getting started to folder'}).click();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Remove folder QA parent',exact:true}).click();
  await expect(page.getByRole('button',{name:'Collapse folder QA child'})).toBeVisible();
  await page.reload();
  await expect(page.locator('.request-nav').filter({hasText:'Get a sample TODO'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Collapse folder QA parent'})).toHaveCount(0);
});
test('clear history can be cancelled and never removes saved requests',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'Request URL'}).fill('http://127.0.0.1:4311/echo');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.response-metrics')).toContainText('200');
  await page.getByRole('tab',{name:'History',exact:true}).click();
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Clear history',exact:true}).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Clear history',exact:true}).click();
  await expect(page.locator('.history-item')).toHaveCount(0);
  // Discard only this unsaved test URL before reloading the browser preview.
  await page.getByRole('textbox',{name:'Request URL'}).fill('https://jsonplaceholder.typicode.com/todos/1');
  await page.reload();
  await expect(page.locator('.request-nav').filter({hasText:'Get a sample TODO'})).toBeVisible();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).history,key)).toEqual([]);
});
test('exported JSON restores exact saved requests and folders after explicit confirmation',async({page})=>{
  await page.goto('/');
  page.once('dialog',d=>d.accept('Export QA / Nested'));
  await page.getByRole('button',{name:'New folder'}).click();
  page.once('dialog',d=>d.accept('Export QA / Nested'));
  await page.getByRole('button',{name:'Move collection Getting started to folder'}).click();
  await page.getByRole('textbox',{name:'Request URL'}).fill('http://127.0.0.1:4311/echo?roundtrip=yes');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const original=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  await page.getByRole('button',{name:'Workspace actions'}).click();
  page.once('dialog',d=>d.accept());
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export workspace as JSON'}).click();
  const download=await downloadPromise;
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(exported.collections).toEqual(original.collections);
  expect(exported.folders).toEqual(original.folders);
  page.once('dialog',d=>d.accept());
  await importJson(page,exported);
  await expect(page.locator('.toast')).toContainText('Workspace restored');
  await page.reload();
  const restored=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  expect(restored.collections).toEqual(original.collections);
  expect(restored.folders).toEqual(original.folders);
});
test('repeated Postman imports are additive and never execute imported scripts',async({page})=>{
  await page.goto('/');
  page.on('dialog',d=>d.accept());
  const data={info:{name:'Repeated QA'},item:[{name:'Fake request',request:{method:'GET',url:'http://127.0.0.1:4311/echo'},event:[{listen:'test',script:{exec:['window.qaImportedScript=true']}}]}]};
  for(let i=0;i<2;i++){
    await importJson(page,data);
    await expect(page.locator('.toast')).toContainText('Postman collection imported');
  }
  const workspace=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  expect(workspace.collections.filter(c=>c.name.startsWith('Repeated QA'))).toHaveLength(2);
  expect(new Set(workspace.collections.flatMap(c=>c.requests.map(r=>r.id))).size).toBe(3);
  expect(await page.evaluate(()=>window.qaImportedScript)).toBeUndefined();
  await expect(page.locator('.alert.warning')).toContainText('scripts');
});
