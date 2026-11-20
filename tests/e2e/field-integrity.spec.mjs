import {test,expect} from '@playwright/test';
test('oversize edited body cannot replace the last valid saved request',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const original=await page.evaluate(()=>localStorage.getItem('api-studio.workspace.v1'));
  await page.getByRole('combobox',{name:'HTTP method'}).selectOption('POST');
  await page.locator('.editor-tabs').getByRole('button',{name:'Body',exact:true}).click();
  await page.getByRole('radio',{name:'JSON',exact:true}).check();
  const body=JSON.stringify({payload:'x'.repeat(2000000)});
  await page.getByRole('textbox',{name:'Request body'}).fill(body);
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.alert.warning')).toContainText('Request body exceeds');
  await expect(page.getByRole('alert')).toContainText('Could not save');
  expect(await page.getByRole('textbox',{name:'Request body'}).inputValue()).toBe(body);
  expect(await page.evaluate(()=>localStorage.getItem('api-studio.workspace.v1'))).toBe(original);
});
test('oversize native backup and Postman input preserve existing workspace before confirmation',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const original=await page.evaluate(()=>localStorage.getItem('api-studio.workspace.v1'));
  const native=JSON.parse(original);native.collections[0].requests[0].body='x'.repeat(2000001);
  const postman={info:{name:'Oversize QA'},item:[{name:'QA',request:{method:'POST',url:'http://127.0.0.1/echo',body:{mode:'raw',raw:'x'.repeat(2000001)}}}]};
  let confirmations=0;page.on('dialog',d=>{confirmations++;return d.dismiss();});
  for(const data of [native,postman]){
    await page.getByRole('button',{name:'Workspace actions'}).click();
    await page.locator('.import-choice input[type=file]').setInputFiles({name:'qa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await expect(page.getByRole('alert')).toContainText('Request body exceeds');
    expect(await page.evaluate(()=>localStorage.getItem('api-studio.workspace.v1'))).toBe(original);
  }
  expect(confirmations).toBe(0);
});
