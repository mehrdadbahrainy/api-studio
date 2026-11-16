import { expect, test } from '@playwright/test';

const LEGACY = 'api-studio.workspace.v1';
const DISK = 'test.api-studio.encrypted-file';
const PASS = 'test-vault-password-123';

/** IPC is simulated, but cryptography runs in the real Chromium Web Crypto engine.
 * Native Windows launch, MSI install and uninstall are tested separately in CI.
 */
async function desktop(page) {
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args = {}) => {
        if (command === 'read_encrypted_workspace') return localStorage.getItem('test.api-studio.encrypted-file');
        if (command === 'legacy_stronghold_exists') return localStorage.getItem('test.legacy-stronghold') === '1';
        if (command === 'write_encrypted_workspace') {
          if (localStorage.getItem('test.fail-save') === '1') throw new Error('Simulated file write failure');
          localStorage.setItem('test.api-studio.encrypted-file', args.payload);
          return null;
        }
        if (command === 'plugin:app|version') return '0.1.2';
        throw new Error('Unexpected desktop IPC command: ' + command);
      }
    };
  });
}

async function unlock(page, passphrase = PASS) {
  await page.locator('#vault-passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock / create encrypted vault' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock API Studio' })).toBeHidden();
}

test('desktop vault: encrypted workspace persists after app reload without storing secrets', async ({ page }) => {
  await desktop(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Unlock API Studio' })).toBeVisible();
  await unlock(page);
  await page.getByRole('textbox', { name: 'Request name' }).fill('Encrypted workspace saved');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const ciphertext = await page.evaluate(key => localStorage.getItem(key), DISK);
  expect(ciphertext).toContain('"ciphertext"');
  expect(ciphertext).not.toContain('Encrypted workspace saved');
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toBeNull();
  await page.reload();
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Encrypted workspace saved');
});

test('desktop vault: plaintext v0.1.0 migrates only after confirmed encrypted write', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Request name' }).fill('Old collection preserved');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toContain('Old collection preserved');
  await desktop(page);
  await page.reload();
  await unlock(page);
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toBeNull();
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Old collection preserved');
  await page.reload();
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Old collection preserved');
});

test('desktop vault: failed encrypted write keeps plaintext and can be retried safely', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Request name' }).fill('Do not lose my previous data');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await page.evaluate(() => localStorage.setItem('test.fail-save', '1'));
  await desktop(page);
  await page.reload();
  await page.locator('#vault-passphrase').fill(PASS);
  await page.getByRole('button', { name: 'Unlock / create encrypted vault' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toContain('Do not lose my previous data');
  await page.evaluate(() => localStorage.removeItem('test.fail-save'));
  await unlock(page);
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toBeNull();
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Do not lose my previous data');
});

test('desktop vault: wrong password cannot overwrite encrypted workspace', async ({ page }) => {
  await desktop(page);
  await page.goto('/');
  await unlock(page);
  await page.getByRole('textbox', { name: 'Request name' }).fill('Protected by passphrase');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const original = await page.evaluate(key => localStorage.getItem(key), DISK);
  await page.reload();
  await page.locator('#vault-passphrase').fill('totally-wrong-password');
  await page.getByRole('button', { name: 'Unlock / create encrypted vault' }).click();
  await expect(page.getByRole('alert')).toContainText(/Incorrect passphrase/i);
  expect(await page.evaluate(key => localStorage.getItem(key), DISK)).toBe(original);
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Protected by passphrase');
});

test('desktop vault: legacy Stronghold file blocks silently creating an empty replacement', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('test.legacy-stronghold', '1'));
  await desktop(page);
  await page.reload();
  await page.locator('#vault-passphrase').fill(PASS);
  await page.getByRole('button', { name: 'Unlock / create encrypted vault' }).click();
  await expect(page.getByRole('alert')).toContainText(/Stronghold vault exists/i);
  expect(await page.evaluate(key => localStorage.getItem(key), DISK)).toBeNull();
});
