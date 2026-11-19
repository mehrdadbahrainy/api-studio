import {test,expect} from '@playwright/test';
const fixture='http://127.0.0.1:4311';
test('response supports formatted vs raw JSON and saves the original response text',async({page})=>{
  const json='{"name":"hello","items":[1,2]}';
  await page.route(fixture+'/preview-json',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:json}));
  await page.goto('/');
  await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/preview-json');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  const body=page.locator('.response-code');
  await expect(body).toContainText('"name": "hello"');
  await page.locator('.response-format-control').getByRole('button',{name:'Raw'}).click();
  await expect(body).toHaveText(json);
  page.once('dialog',d=>d.accept());
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Save response'}).click();
  expect((await download).suggestedFilename()).toMatch(/^api-response-.*\.json$/);
});
test('HTML responses display as text, never execute scripts',async({page})=>{
  await page.route(fixture+'/preview-html',route=>route.fulfill({status:200,contentType:'text/html',headers:{'Access-Control-Allow-Origin':'*'},body:'<html><body><script>window.pwned = true</script><p>Hello</p></body></html>'}));
  await page.goto('/');
  await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/preview-html');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.locator('.response-code')).toContainText('<script>window.pwned = true</script>');
  expect(await page.evaluate(()=>window.pwned===true)).toBe(false);
});
