import { expect, test } from '@playwright/test';

/**
 * These browser tests exercise the *desktop IPC contract* using a deterministic
 * Stronghold adapter. Native Windows startup is tested separately in CI.
 * Do not interpret these as native cryptographic tests.
 */
async function emulateDesktop(page) {
  await page.addInitScript(() => {
    const DISK = 'api-studio.test.snapshot';
    const FAIL = 'api-studio.test.fail-save';
    let active = null;
    const disk = () => {
      const serialized = localStorage.getItem(DISK);
      return serialized ? JSON.parse(serialized) : null;
    };
    const save = () => {
      if (localStorage.getItem(FAIL) === '1') throw new Error('disk full (simulated)');
      localStorage.setItem(DISK, JSON.stringify(active));
    };
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args = {}) => {
        if (command === 'plugin:path|resolve_directory') return 'C:/test/api-studio';
        if (command === 'plugin:stronghold|initialize') {
          if (!active) active = disk() || { password: args.password, client: false, records: {} };
          if (active.password !== args.password) throw new Error('incorrect password');
          return null;
        }
        if (command === 'plugin:stronghold|load_client') {
          if (!active?.client) throw new Error('client not found');
          return null;
        }
        if (command === 'plugin:stronghold|create_client') {
          active.client = true;
          return null;
        }
        if (command === 'plugin:stronghold|get_store_record') {
          return active.records[args.key] ?? null;
        }
        if (command === 'plugin:stronghold|save_store_record') {
          active.records[args.key] = args.value;
          return null;
        }
        if (command === 'plugin:stronghold|save') {
          save();
          return null;
        }
        if (command === 'plugin:stronghold|destroy') {
          save();
          active = null;
          return null;
        }
        if (command === 'plugin:app|version') return '0.1.2';
        throw new Error('Unsupported mock IPC call: ' + command);
      }
    };
  });
}

async function unlock(page, password = 'test-vault-password-123') {
  await page.locator('#vault-passphrase').fill(password);
  await page.getByRole('button', { name: 'Unlock / create encrypted vault' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock API Studio' })).toBeHidden();
}

test('desktop IPC: initial unlock, save request and reopen persistent snapshot', async ({ page }) => {
  await emulateDesktop(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Unlock API Studio' })).toBeVisible();
  await unlock(page);
  await page.getByRole('textbox', { name: 'Request name' }).fill('Encrypted request saved');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('api-studio.test.snapshot'))).not.toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('api-studio.workspace.v1'))).toBeNull();
  await page.reload();
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Encrypted request saved');
});

test('desktop IPC: legacy browser workspace migrates only after verification', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Request name' }).fill('Legacy migrated request');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  const legacy = await page.evaluate(() => localStorage.getItem('api-studio.workspace.v1'));
  expect(legacy).toContain('Legacy migrated request');
  await emulateDesktop(page);
  await page.reload();
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Legacy migrated request');
  expect(await page.evaluate(() => localStorage.getItem('api-studio.workspace.v1'))).toBeNull();
  await page.reload();
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Legacy migrated request');
});

test('desktop IPC: failed disk save keeps legacy data and permits safe retry', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Request name' }).fill('Do not lose this workspace');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await page.evaluate(() => localStorage.setItem('api-studio.test.fail-save', '1'));
  await emulateDesktop(page);
  await page.reload();
  await page.locator('#vault-passphrase').fill('test-vault-password-123');
  await page.getByRole('button', { name: 'Unlock / create encrypted vault' }).click();
  await expect(page.getByRole('alert')).toContainText(/disk is full/i);
  expect(await page.evaluate(() => localStorage.getItem('api-studio.workspace.v1'))).toContain('Do not lose this workspace');
  await page.evaluate(() => localStorage.removeItem('api-studio.test.fail-save'));
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Do not lose this workspace');
  expect(await page.evaluate(() => localStorage.getItem('api-studio.workspace.v1'))).toBeNull();
});

test('desktop IPC: wrong passphrase does not destroy saved data', async ({ page }) => {
  await emulateDesktop(page);
  await page.goto('/');
  await unlock(page);
  await page.getByRole('textbox', { name: 'Request name' }).fill('Keep encrypted data');
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await page.reload();
  await page.locator('#vault-passphrase').fill('incorrect-passphrase-123');
  await page.getByRole('button', { name: 'Unlock / create encrypted vault' }).click();
  await expect(page.getByRole('alert')).toContainText(/passphrase was rejected/i);
  await unlock(page);
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Keep encrypted data');
});
