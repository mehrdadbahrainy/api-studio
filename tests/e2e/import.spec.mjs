import { expect, test } from '@playwright/test';

const postman = {
  info: {name:'Imported Orders',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},
  auth:{type:'bearer',bearer:[{key:'token',value:'{{token}}'}]},
  variable:[{key:'token',value:'demo-token'}],
  item:[
    {name:'Orders',item:[
      {name:'List orders',request:{method:'GET',url:{raw:'https://example.test/orders?limit=2',query:[{key:'limit',value:'2'}]}}},
      {name:'Create order',request:{method:'POST',url:'https://example.test/orders',
        body:{mode:'raw',raw:'{"item":"book"}',options:{raw:{language:'json'}}}}}
    ]}
  ]
};

test('import Postman collection adds requests without destroying existing saved data',async({page})=>{
  await page.goto('/');
  await expect(page.getByTitle('Getting started').locator('span')).toBeVisible();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Workspace actions'}).click();
  await page.locator('.import-choice input[type=file]').setInputFiles({
    name:'orders.postman_collection.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(postman),'utf8')
  });
  await expect(page.locator('.toast')).toContainText('Postman collection imported (2 requests)');
  await expect(page.getByTitle('Getting started').locator('span')).toBeVisible();
  await expect(page.getByTitle('Imported Orders / Orders').locator('span')).toBeVisible();
  await expect(page.locator('.request-nav').filter({hasText:'List orders'})).toBeVisible();
  await expect(page.locator('.request-nav').filter({hasText:'Create order'})).toBeVisible();
  await page.reload();
  await expect(page.getByTitle('Imported Orders / Orders').locator('span')).toBeVisible();
  await page.locator('.request-nav').filter({hasText:'Create order'}).click();
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Create order');
});

test('invalid JSON import explains the error and preserves existing workspace',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Workspace actions'}).click();
  await page.locator('.import-choice input[type=file]').setInputFiles({
    name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"broken":','utf8')
  });
  await expect(page.getByRole('alert')).toContainText('Invalid JSON file');
  await expect(page.getByTitle('Getting started').locator('span')).toBeVisible();
  await page.reload();
  await expect(page.getByTitle('Getting started').locator('span')).toBeVisible();
});

test('native API Studio restore still requests explicit replacement confirmation',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Workspace actions'}).click();
  const workspace={version:1,collections:[{id:'custom',name:'Backup Collection',requests:[]}],
    environments:[],selectedEnvironmentId:null,history:[]};
  page.on('dialog',dialog=>dialog.dismiss());
  await page.locator('.import-choice input[type=file]').setInputFiles({
    name:'workspace.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(workspace),'utf8')
  });
  await expect(page.getByTitle('Getting started').locator('span')).toBeVisible();
  await expect(page.getByTitle('Backup Collection')).toHaveCount(0);
});
