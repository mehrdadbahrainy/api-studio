import { test, expect } from '@playwright/test';
const fixture = 'http://127.0.0.1:4311';
const send = async (page, path) => {
  await page.getByRole('textbox', {name:'Request URL'}).fill(fixture + path);
  await page.getByRole('button', {name:'Send', exact:true}).click();
};
test.beforeEach(async ({page}) => { await page.goto('/'); });
for (const method of ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']) {
  test(`real HTTP ${method}`, async ({page}) => {
    await page.getByRole('combobox', {name:'HTTP method'}).selectOption(method);
    await send(page, '/echo?method=' + method);
    await expect(page.locator('.response-metrics')).toContainText(method === 'OPTIONS' ? '204' : '200');
    if (!['HEAD','OPTIONS'].includes(method)) {
      await expect(page.locator('.response-code')).toContainText(`"method": "${method}"`);
    }
  });
}
for (const status of [201,204,304,400,401,404,500,503]) {
  test(`real HTTP status ${status}`, async ({page}) => {
    await send(page, '/status/' + status);
    await expect(page.locator('.response-metrics')).toContainText(String(status));
    if (![204,304].includes(status)) await expect(page.locator('.response-code')).toContainText('status-' + status);
  });
}
test('real HTTP redirect follows to final response', async ({page}) => {
  await send(page, '/redirect');
  await expect(page.locator('.response-code')).toContainText('"redirected": "yes"');
});
for (const [kind, expected] of [['json','سلام'],['invalid','{invalid'],['xml','<item>hello</item>'],['html','<script>window.qaInjected=true</script>'],['text','plain response']]) {
  test(`real HTTP ${kind} raw and formatted response`, async ({page}) => {
    const unexpected = [];
    page.on('request', r => { if(r.url().includes('should-not-load')) unexpected.push(r.url()); });
    await send(page, '/payload?kind=' + kind);
    await expect(page.locator('.response-code')).toContainText(expected);
    await page.getByRole('button', {name:'Raw', exact:true}).click();
    await expect(page.locator('.response-code')).toContainText(expected);
    expect(await page.evaluate(() => window.qaInjected)).toBeUndefined();
    expect(unexpected).toEqual([]);
  });
}
test('elapsed time includes downloading a delayed response body', async ({page}) => {
  await send(page, '/slow-body?ms=700');
  await expect(page.locator('.response-code')).toHaveText('first-last');
  const metrics = await page.locator('.response-metrics').innerText();
  const duration = Number(metrics.match(/Time\s*(\d+)\s*ms/)[1]);
  expect(duration).toBeGreaterThanOrEqual(650);
});
test('cancel interrupts a real delayed HTTP request and permits another send', async ({page}) => {
  await send(page, '/delay?ms=5000');
  await expect(page.getByText('Sending request...')).toBeVisible();
  await page.getByRole('button', {name:'Cancel', exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Request cancelled');
  await send(page, '/echo?after=cancel');
  await expect(page.locator('.response-code')).toContainText('"after": "cancel"');
});
test('30 second transport timeout terminates real HTTP', async ({page}) => {
  test.setTimeout(45000);
  await send(page, '/delay?ms=35000');
  await expect(page.getByRole('alert')).toContainText('timed out after 30 seconds', {timeout:35000});
});
test('response preview is bounded while raw copy retains complete text', async ({page,context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await send(page, '/payload?kind=large');
  await expect(page.locator('.response-code')).toHaveText('x'.repeat(500000));
  await page.getByRole('button', {name:'Copy', exact:true}).click();
  expect(await page.evaluate(async () => (await navigator.clipboard.readText()).length)).toBe(600000);
});
test('oversized body displays an explicit limit message', async ({page}) => {
  await send(page, '/payload?kind=oversized');
  await expect(page.locator('.response-code')).toContainText('5 MB preview limit');
});
for (const [mode,value,expectedType] of [['Text','سلام test','text/plain'],['URL encoded','name=John+Smith&city=Tehran','application/x-www-form-urlencoded']]) {
  test(`real HTTP ${mode} request body`, async ({page}) => {
    await page.getByRole('combobox',{name:'HTTP method'}).selectOption('POST');
    await page.locator('.editor-tabs').getByRole('button',{name:'Body',exact:true}).click();
    await page.getByRole('radio',{name:mode,exact:true}).check();
    await page.getByRole('textbox',{name:'Request body'}).fill(value);
    await send(page,'/echo');
    await expect(page.locator('.response-metrics')).toContainText('200');
    const result=JSON.parse(await page.locator('.response-code').innerText());
    expect(result.body).toBe(value); expect(result.contentType).toContain(expectedType);
  });
}
test('real HTTP multipart generates boundary and sends enabled text fields', async ({page}) => {
  await page.getByRole('combobox',{name:'HTTP method'}).selectOption('POST');
  await page.locator('.editor-tabs').getByRole('button',{name:'Body',exact:true}).click();
  await page.getByRole('radio',{name:'Form data',exact:true}).check();
  await page.getByRole('textbox',{name:'Form field name'}).fill('qa');
  await page.getByRole('textbox',{name:'Form field value'}).fill('fake-value');
  await send(page,'/echo');
  await expect(page.locator('.response-code')).toContainText('fake-value');
  const result=JSON.parse(await page.locator('.response-code').innerText());
  expect(result.contentType).toMatch(/multipart\/form-data; boundary=/);
  expect(result.body).toContain('name="qa"');
});
for (const mode of ['bearer','basic']) {
  test(`real HTTP ${mode} authentication and private history`, async ({page}) => {
    await page.locator('.editor-tabs').getByRole('button',{name:'Authorization',exact:true}).click();
    await page.getByLabel('Auth type').selectOption(mode);
    const expected = mode==='bearer' ? 'Bearer FAKE_QA_TOKEN' : 'Basic '+Buffer.from('qa:FAKE_QA_PASSWORD').toString('base64');
    if(mode==='bearer') await page.getByRole('textbox',{name:'Bearer token'}).fill('FAKE_QA_TOKEN');
    else {
      await page.getByRole('textbox',{name:'Basic auth username'}).fill('qa');
      await page.getByRole('textbox',{name:'Basic auth password'}).fill('FAKE_QA_PASSWORD');
    }
    await send(page,'/echo');
    await expect(page.locator('.response-code')).toContainText(expected);
    const history=await page.evaluate(()=>JSON.parse(localStorage.getItem('api-studio.workspace.v1')).history);
    expect(JSON.stringify(history)).not.toMatch(/FAKE_QA|authorization/i);
  });
}
test('editing a request during transport cannot rewrite the sent history entry', async ({page}) => {
  await send(page,'/delay?ms=1200');
  await page.getByRole('textbox',{name:'Request URL'}).fill(fixture+'/never-sent');
  await expect(page.locator('.response-code')).toHaveText('delayed');
  const history=await page.evaluate(()=>JSON.parse(localStorage.getItem('api-studio.workspace.v1')).history);
  expect(history[0].request.url).toContain('/delay');
  expect(history[0].request.url).not.toContain('never-sent');
});
test('tab responses stay independent and running requests explicitly block tab changes', async ({page}) => {
  await page.getByRole('textbox',{name:'Request name'}).fill('First QA');
  await send(page,'/echo?tab=first');
  await expect(page.locator('.response-code')).toContainText('"tab": "first"');
  await page.getByRole('button',{name:'Open new request tab'}).click();
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Untitled request');
  await page.getByRole('textbox',{name:'Request name'}).fill('Second QA');
  await send(page,'/delay?ms=1500');
  await page.getByRole('tab',{name:'Open First QA'}).click();
  await expect(page.locator('.toast')).toContainText('Cancel or finish');
  await expect(page.getByRole('textbox',{name:'Request name'})).toHaveValue('Second QA');
  await expect(page.locator('.response-code')).toHaveText('delayed');
  await page.getByRole('tab',{name:'Open First QA'}).click();
  await expect(page.locator('.response-code')).toContainText('"tab": "first"');
});
