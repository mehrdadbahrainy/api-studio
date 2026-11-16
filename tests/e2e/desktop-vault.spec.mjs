import { expect, test } from '@playwright/test';

const LEGACY = 'api-studio.workspace.v1';
const PROTECTED = 'test.api-studio.dpapi-file';
const ENCRYPTED = 'test.api-studio.encrypted-file';
const PASS = 'test-vault-password-123';

/**
 * Tauri IPC is mocked in Chromium; Angular, WebCrypto, real import UI and
 * desktop initialization run in the browser. DPAPI in this mock is a marker
 * encoding ONLY, not production cryptography. Windows native acceptance
 * independently exercises real CurrentUser DPAPI on the installed MSI.
 */
async function desktop(page) {
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args = {}) => {
        if (command === 'is_system_vault_supported') return true;
        if (command === 'protected_workspace_exists') return localStorage.getItem('test.api-studio.dpapi-file') !== null;
        if (command === 'read_protected_workspace') {
          const item = localStorage.getItem('test.api-studio.dpapi-file');
          return item === null ? null : decodeURIComponent(atob(item.slice(11)));
        }
        if (command === 'write_protected_workspace') {
          if (localStorage.getItem('test.fail-save') === '1') throw new Error('Simulated disk write failed');
          localStorage.setItem('test.api-studio.dpapi-file', 'dpapi-mock:' + btoa(encodeURIComponent(args.payload)));
          return null;
        }
        if (command === 'remove_protected_workspace') {
          localStorage.removeItem('test.api-studio.dpapi-file');
          return null;
        }
        if (command === 'read_encrypted_workspace') return localStorage.getItem('test.api-studio.encrypted-file');
        if (command === 'legacy_stronghold_exists') return localStorage.getItem('test.legacy-stronghold') === '1';
        if (command === 'write_encrypted_workspace') {
          if (localStorage.getItem('test.fail-save') === '1') throw new Error('Simulated encrypted write failure');
          localStorage.setItem('test.api-studio.encrypted-file', args.payload);
          return null;
        }
        if (command === 'plugin:app|version') return '0.1.3';
        throw new Error('Unexpected desktop IPC command: ' + command);
      }
    };
  });
}
async function openPasswordless(page) {
  await expect(page.locator('.vault-backdrop')).toBeHidden({ timeout:30_000 });
  await expect(page.getByRole('textbox', {name:'Request URL'})).toBeVisible();
}
async function enablePassword(page) {
  await page.getByRole('button', {name:'Workspace actions'}).click();
  await page.getByRole('button', {name:'Security settings'}).click();
  await page.getByRole('textbox', {name:'New workspace passphrase'}).fill(PASS);
  await page.getByRole('button', {name:'Enable passphrase on next start'}).click();
  await expect(page.getByRole('heading', {name:'Security settings'})).toBeHidden();
}

test('fresh Windows desktop starts passwordless, saves protected data, survives reload', async ({page}) => {
  await desktop(page);
  await page.goto('/');
  await openPasswordless(page);
  await page.getByRole('textbox', {name:'Request name'}).fill('Stored under Windows account');
  await page.getByRole('button', {name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const bytes=await page.evaluate(key=>localStorage.getItem(key),PROTECTED);
  assertNotPlaintext(bytes, 'Stored under Windows account');
  await page.reload();
  await openPasswordless(page);
  await expect(page.getByRole('textbox', {name:'Request name'})).toHaveValue('Stored under Windows account');
});

function assertNotPlaintext(value, text) {
  expect(value).toBeTruthy();
  expect(value).not.toContain(text);
  expect(value).toContain('dpapi-mock:');
}

test('legacy v0.1.0 plaintext migrates only after verified Windows-protected save', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox', {name:'Request name'}).fill('Legacy request preserved');
  await page.getByRole('button', {name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  expect(await page.evaluate(key=>localStorage.getItem(key),LEGACY)).toContain('Legacy request preserved');
  await desktop(page);
  await page.reload();
  await openPasswordless(page);
  expect(await page.evaluate(key=>localStorage.getItem(key),LEGACY)).toBeNull();
  await expect(page.getByRole('textbox', {name:'Request name'})).toHaveValue('Legacy request preserved');
  assertNotPlaintext(await page.evaluate(key=>localStorage.getItem(key),PROTECTED),'Legacy request preserved');
});

test('failed Windows protected migration leaves legacy data intact and can retry', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox', {name:'Request name'}).fill('Keep my old workspace');
  await page.getByRole('button', {name:/Save request/}).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await page.evaluate(()=>localStorage.setItem('test.fail-save','1'));
  await desktop(page);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(/protected workspace/i);
  expect(await page.evaluate(key=>localStorage.getItem(key),LEGACY)).toContain('Keep my old workspace');
  expect(await page.evaluate(key=>localStorage.getItem(key),PROTECTED)).toBeNull();
  await page.evaluate(()=>localStorage.removeItem('test.fail-save'));
  await page.reload();
  await openPasswordless(page);
  await expect(page.getByRole('textbox', {name:'Request name'})).toHaveValue('Keep my old workspace');
});

test('optional passphrase requires password on next start and wrong password preserves encrypted file', async ({page}) => {
  await desktop(page);
  await page.goto('/');
  await openPasswordless(page);
  await page.getByRole('textbox', {name:'Request name'}).fill('Optional password request');
  await page.getByRole('button', {name:/Save request/}).click();
  await enablePassword(page);
  expect(await page.evaluate(key=>localStorage.getItem(key),PROTECTED)).toBeNull();
  const old=await page.evaluate(key=>localStorage.getItem(key),ENCRYPTED);
  expect(old).toContain('ciphertext');
  expect(old).not.toContain('Optional password request');
  await page.reload();
  await expect(page.locator('#vault-passphrase')).toBeVisible();
  await page.locator('#vault-passphrase').fill('totally-wrong-password');
  await page.getByRole('button', {name:'Unlock existing encrypted vault'}).click();
  await expect(page.getByRole('alert')).toContainText(/Incorrect passphrase/i);
  expect(await page.evaluate(key=>localStorage.getItem(key),ENCRYPTED)).toBe(old);
  await page.locator('#vault-passphrase').fill(PASS);
  await page.getByRole('button', {name:'Unlock existing encrypted vault'}).click();
  await openPasswordless(page);
  await expect(page.getByRole('textbox', {name:'Request name'})).toHaveValue('Optional password request');
  await page.reload();
  await openPasswordless(page);
  assertNotPlaintext(await page.evaluate(key=>localStorage.getItem(key),PROTECTED),'Optional password request');
});

test('unreadable protected file does not silently overwrite or reset data',async ({page})=>{
  await desktop(page);
  await page.goto('/');
  await openPasswordless(page);
  const old=await page.evaluate(key=>{
    localStorage.setItem(key,'dpapi-mock:INVALID-NOT-BASE64');
    return localStorage.getItem(key);
  },PROTECTED);
  await page.reload();
  await expect(page.locator('.vault-error')).toBeVisible();
  await expect(page.locator('#vault-passphrase')).toHaveCount(0);
  expect(await page.evaluate(key=>localStorage.getItem(key),PROTECTED)).toBe(old);
});

test('old Stronghold v0.1.1 snapshot blocks silently creating a new workspace', async ({page})=>{
  await page.goto('/');
  await page.evaluate(()=>localStorage.setItem('test.legacy-stronghold','1'));
  await desktop(page);
  await page.reload();
  await expect(page.locator('.vault-error')).toContainText(/Stronghold vault exists/i);
  expect(await page.evaluate(key=>localStorage.getItem(key),PROTECTED)).toBeNull();
});
