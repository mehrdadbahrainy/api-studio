import { test, expect } from '@playwright/test';

const fixtureBase = 'http://127.0.0.1:4311';

function syntheticRequest(id, method, url, body = '') {
  return {
    id, collectionId: 'qa-flow', name: id, method, url,
    params: [], headers: [{ id: 'accept-' + id, enabled: true, key: 'Accept', value: 'application/json' }],
    bodyMode: body ? 'json' : 'none', body, formData: [],
    authMode: id === 'login' ? 'none' : 'bearer',
    bearerToken: id === 'login' ? '' : '{{token}}',
    basicUsername: '', basicPassword: ''
  };
}

async function seedFlow(page) {
  await page.goto('/');
  await page.evaluate(({ base }) => {
    const request = (id, method, url, body = '') => ({
      id, collectionId: 'qa-flow', name: id, method, url,
      params: [], headers: [{ id: 'accept-' + id, enabled: true, key: 'Accept', value: 'application/json' }],
      bodyMode: body ? 'json' : 'none', body, formData: [],
      authMode: id === 'login' ? 'none' : 'bearer',
      bearerToken: id === 'login' ? '' : '{{token}}',
      basicUsername: '', basicPassword: ''
    });
    localStorage.setItem('api-studio.workspace.v1', JSON.stringify({
      version: 1, collections: [{
        id: 'qa-flow', name: 'Scenario fixture',
        requests: [
          request('login', 'POST', base + '/scenario/login', '{"username":"qa"}'),
          request('create', 'POST', base + '/scenario/orders', '{"name":"fake"}'),
          request('read', 'GET', base + '/scenario/orders/{{orderId}}'),
          request('ship', 'PATCH', base + '/scenario/orders/{{orderId}}', '{"state":"shipped"}')
        ]
      }],
      environments: [], selectedEnvironmentId: null, history: []
    }));
  }, { base: fixtureBase });
  await page.reload();
}

test('user creates, executes and restores script-free four-step Scenario with no leaked runtime token', async ({page}) => {
  await seedFlow(page);
  await page.getByRole('tab', {name:'Scenarios'}).click();
  await page.getByRole('button', {name:'Create scenario'}).click();
  const dialog = page.getByRole('dialog', {name:'Scenario Builder'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', {name:'Scenario name'}).fill('QA order flow');
  await dialog.getByRole('combobox', {name:'Saved request for step 1'}).selectOption('login');

  await dialog.getByRole('button',{name:'Add extraction to step 1'}).click();
  await dialog.getByRole('textbox',{name:'Extract JSON path'}).last().fill('$.token');
  await dialog.getByRole('textbox',{name:'Variable name'}).last().fill('token');

  await dialog.getByRole('button',{name:'Add saved request step'}).click();
  await dialog.getByRole('combobox',{name:'Saved request for step 2'}).selectOption('create');
  await dialog.getByRole('spinbutton',{name:'Expected status'}).last().fill('201');
  await dialog.getByRole('button',{name:'Add extraction to step 2'}).click();
  await dialog.getByRole('textbox',{name:'Extract JSON path'}).last().fill('$.id');
  await dialog.getByRole('textbox',{name:'Variable name'}).last().fill('orderId');

  await dialog.getByRole('button',{name:'Add saved request step'}).click();
  await dialog.getByRole('combobox',{name:'Saved request for step 3'}).selectOption('read');
  await dialog.getByRole('button',{name:'Add assertion to step 3'}).click();
  await dialog.getByRole('combobox',{name:'Assertion type 2 step 3'}).selectOption('json-equals');
  await dialog.getByRole('textbox',{name:'JSON field path'}).last().fill('$.state');
  await dialog.getByRole('textbox',{name:'Expected JSON value'}).fill('placed');

  await dialog.getByRole('button',{name:'Add saved request step'}).click();
  await dialog.getByRole('combobox',{name:'Saved request for step 4'}).selectOption('ship');
  await dialog.getByRole('button',{name:'Save scenario'}).click();
  await expect(page.getByRole('status').filter({hasText:'Scenario saved'})).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await dialog.getByRole('button',{name:'Run scenario'}).click();
  const report = dialog.getByRole('status',{name:'Scenario test results'});
  await expect(report).toContainText('4 Passed');
  await expect(report).toContainText('0 Failed');
  await expect(report.locator('.scenario-result')).toHaveCount(4);
  await expect(report.locator('.scenario-failed')).toHaveCount(0);

  const saved = await page.evaluate(() => localStorage.getItem('api-studio.workspace.v1'));
  expect(saved).not.toContain('qa-private-fake-token');
  expect(saved).not.toContain('scenarioReport');
  expect(saved).not.toContain('runId');
  expect(JSON.parse(saved).scenarios[0].steps).toHaveLength(4);

  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();
  await page.getByRole('tab',{name:'Scenarios'}).click();
  await page.getByRole('button',{name:'Open scenario QA order flow'}).click();
  await expect(page.getByRole('dialog',{name:'Scenario Builder'})).toBeVisible();
  await expect(page.locator('.scenario-step')).toHaveCount(4);
  await expect(page.locator('.scenario-results')).toHaveCount(0);
});

test('invalid variable extraction is rejected before persisting and cannot send any HTTP traffic', async ({page}) => {
  await seedFlow(page);
  await page.getByRole('tab',{name:'Scenarios'}).click();
  await page.getByRole('button',{name:'Create scenario'}).click();
  const dialog = page.getByRole('dialog',{name:'Scenario Builder'});
  await dialog.getByRole('button',{name:'Add extraction to step 1'}).click();
  await dialog.getByRole('textbox',{name:'Variable name'}).fill('__proto__');
  await dialog.getByRole('button',{name:'Run scenario'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Invalid or duplicated extracted variable name');
  const saved = await page.evaluate(() => localStorage.getItem('api-studio.workspace.v1'));
  expect(JSON.parse(saved).scenarios).toBeUndefined();
  await expect(dialog.locator('.scenario-results')).toHaveCount(0);
});
