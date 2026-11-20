import {test,expect} from '@playwright/test';
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
