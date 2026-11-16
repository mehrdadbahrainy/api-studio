import {expect,test} from '@playwright/test';
const LEGACY='api-studio.workspace.v1';
const VAULT='api-studio.encrypted-workspace.v2';
const PASSWORD='test-vault-password-123';
async function desktop(page) {
  await page.addInitScript(()=>{
    window.isTauri=true;
    window.__TAURI_INTERNALS__={invoke:async cmd=>{
      if(cmd==='plugin:app|version')return '0.1.2';
      throw new Error('Unexpected IPC call '+cmd);
    }};
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value) {
      if(key==='api-studio.encrypted-workspace.v2' &&
        Storage.prototype.getItem.call(this,'test.fail-vault')==='1')
        throw new DOMException('Quota exceeded','QuotaExceededError');
      return original.call(this,key,value);
    };
  });
}
async function unlock(page,pass=PASSWORD) {
  await page.locator('#vault-passphrase').fill(pass);
  await page.getByRole('button',{name:'Unlock / create encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock API Studio'})).toBeHidden();
}
test('desktop Web Crypto: save encrypted data and reopen after restart',async({page})=>{
  await desktop(page);await page.goto('/');
  await expect(page.getByRole('heading',{name:'Unlock API Studio'})).toBeVisible();
  await unlock(page);
  await page.getByRole('textbox',{name:'Request name'}).fill('Encrypted secret project');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const ciphertext=await page.evaluate(k=>localStorage.getItem(k),VAULT);
  expect(ciphertext).toContain('"ciphertext"');
  expect(ciphertext).not.toContain('Encrypted secret project');
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY)).toBeNull();
  await page.reload();await unlock(page);
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Encrypted secret project');
});
test('desktop Web Crypto: v0.1.0 plaintext migrates only after ciphertext verification',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'Request name'}).fill('Legacy request retained');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY)).toContain('Legacy request retained');
  await desktop(page);await page.reload();await unlock(page);
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY)).toBeNull();
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Legacy request retained');
  await page.reload();await unlock(page);
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Legacy request retained');
});
test('desktop Web Crypto: storage failure leaves legacy plaintext untouched',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'Request name'}).fill('Retain me if disk full');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await page.evaluate(()=>localStorage.setItem('test.fail-vault','1'));
  await desktop(page);await page.reload();
  await page.locator('#vault-passphrase').fill(PASSWORD);
  await page.getByRole('button',{name:'Unlock / create encrypted vault'}).click();
  await expect(page.getByRole('alert')).toContainText(/storage is full/i);
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY)).toContain('Retain me if disk full');
  await page.evaluate(()=>localStorage.removeItem('test.fail-vault'));
  await unlock(page);
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY)).toBeNull();
});
test('desktop Web Crypto: wrong password preserves encrypted workspace',async({page})=>{
  await desktop(page);await page.goto('/');await unlock(page);
  await page.getByRole('textbox',{name:'Request name'}).fill('Wrong password should not erase');
  await page.getByRole('button',{name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const before=await page.evaluate(k=>localStorage.getItem(k),VAULT);
  await page.reload();
  await page.locator('#vault-passphrase').fill('wrong-password-12345');
  await page.getByRole('button',{name:'Unlock / create encrypted vault'}).click();
  await expect(page.getByRole('alert')).toContainText(/passphrase is incorrect/i);
  expect(await page.evaluate(k=>localStorage.getItem(k),VAULT)).toBe(before);
  await unlock(page);
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Wrong password should not erase');
});
