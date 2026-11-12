import { expect, test } from '@playwright/test';

const fixture = 'http://127.0.0.1:4311';

async function requestResult(page) {
  await expect(page.locator('.response-metrics')).toContainText('200');
  const code = page.locator('.response-code');
  await expect(code).toBeVisible();
  return JSON.parse(await code.innerText());
}

test('fresh startup has a usable workspace without login or setup', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Personal workspace')).toBeVisible();
  await expect(page.getByText('Getting started', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toHaveValue(/jsonplaceholder/);
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  await expect(page.getByText('Browser preview')).toBeVisible();
});

test('GET sends to a real local HTTP service and displays status, headers, body and history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Request URL' }).fill(`${fixture}/echo?kind=get`);
  await page.getByRole('button', { name: 'Send' }).click();
  expect(await requestResult(page)).toMatchObject({ method: 'GET', path: '/echo', query: { kind: 'get' } });
  await page.locator('.response-tabs').getByRole('button', { name: /Headers/ }).click();
  await expect(page.locator('.response-headers')).toContainText('x-test-server');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  await expect(page.locator('.history-item')).toContainText('200');
});

test('POST JSON body uses the correct HTTP method and content type', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'HTTP method' }).selectOption('POST');
  await page.getByRole('textbox', { name: 'Request URL' }).fill(`${fixture}/echo`);
  await page.locator('.editor-tabs').getByRole('button', { name: /Body/ }).click();
  await page.getByRole('radio', { name: 'JSON' }).check();
  await page.getByRole('textbox', { name: 'Request body' }).fill('{"status":"ok","count":2}');
  await page.getByRole('button', { name: 'Send' }).click();
  const result = await requestResult(page);
  expect(result.method).toBe('POST');
  expect(result.path).toBe('/echo');
  expect(result.contentType).toContain('application/json');
  expect(JSON.parse(result.body)).toEqual({ status: 'ok', count: 2 });
});

test('saved requests persist after reloading a freshly opened browser window', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Request name' }).fill('Local API smoke test');
  await page.getByRole('textbox', { name: 'Request URL' }).fill(`${fixture}/echo?persist=yes`);
  await page.getByRole('button', { name: /Save request/ }).click();
  await expect(page.locator('.toast')).toContainText('Request saved');
  await page.reload();
  const saved = page.locator('.request-nav').filter({ hasText: 'Local API smoke test' });
  await expect(saved).toHaveCount(1);
  await saved.click();
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Local API smoke test');
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toHaveValue(`${fixture}/echo?persist=yes`);
});

test('environment variables are resolved before sending without exposing variable syntax to API', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit environments' }).click();
  await page.getByRole('combobox', { name: 'Active environment' }).selectOption({ label: 'Local development' });
  await page.getByRole('textbox', { name: 'Variable value' }).first().fill(fixture);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('textbox', { name: 'Request URL' }).fill('{{baseUrl}}/echo?via=environment');
  await page.getByRole('button', { name: 'Send' }).click();
  expect(await requestResult(page)).toMatchObject({path:'/echo',query:{via:'environment'}});
});

test('invalid URLs and JSON produce errors instead of being sent', async ({ page }) => {
  await page.goto('/');
  const outgoing=[];
  page.on('request', request => { if (request.url().startsWith(fixture)) outgoing.push(request.url()); });
  await page.getByRole('textbox', { name: 'Request URL' }).fill('file:///etc/passwd');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('alert')).toContainText('Only HTTP and HTTPS');
  expect(outgoing).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Request URL' }).fill(`${fixture}/echo`);
  await page.getByRole('combobox', { name: 'HTTP method' }).selectOption('POST');
  await page.locator('.editor-tabs').getByRole('button', { name: /Body/ }).click();
  await page.getByRole('radio', { name: 'JSON' }).check();
  await page.getByRole('textbox', { name: 'Request body' }).fill('{malformed');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  expect(outgoing).toHaveLength(0);
});

test('mobile preview keeps request editor usable without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport+3);
});
