import {expect,test} from '@playwright/test';
const fixture = 'http://127.0.0.1:4311';

test('history does not store query values or request bodies',async ({page})=>{
  await page.goto('/');
  await page.getByRole('combobox',{name:'HTTP method'}).selectOption('POST');
  await page.getByRole('textbox',{name:'Request URL'}).fill(`${fixture}/echo?token=VERY_PRIVATE&client=ALSO_PRIVATE`);
  await page.locator('.editor-tabs').getByRole('button',{name:/Body/}).click();
  await page.getByRole('radio',{name:'JSON'}).check();
  await page.getByRole('textbox',{name:'Request body'}).fill('{"password":"VERY_PRIVATE","value":42}');
  await page.getByRole('button',{name:'Send'}).click();
  await expect(page.locator('.response-metrics')).toContainText('200');
  const saved = await page.evaluate(()=>localStorage.getItem('api-studio.workspace.v1'));
  expect(saved).not.toContain('VERY_PRIVATE');
  expect(saved).not.toContain('ALSO_PRIVATE');
  await page.getByRole('tab',{name:'History',exact:true}).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
});
test('network failure gives actionable guidance without repeating secrets',async ({page})=>{
  await page.goto('/');
  const secret='supersecretkey';
  await page.getByRole('textbox',{name:'Request URL'}).fill(`http://127.0.0.1:4312/not-running?token=${secret}`);
  await page.getByRole('button',{name:'Send'}).click();
  await expect(page.getByRole('alert')).toContainText(/Could not connect|Connection refused/);
  await expect(page.getByRole('alert')).not.toContainText(secret);
});
