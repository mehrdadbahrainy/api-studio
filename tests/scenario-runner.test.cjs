const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialWorkspace, freshRequest, row } = require('../.test-dist/models.js');
const { prepareRequest } = require('../.test-dist/request-utils.js');
const { runScenario, validateScenario } = require('../.test-dist/scenario-runner.js');

function request(id, method, url, body) {
  const draft = freshRequest();
  draft.id = id;
  draft.name = id;
  draft.method = method;
  draft.url = url;
  draft.headers = [];
  draft.params = [];
  draft.bodyMode = body ? 'json' : 'none';
  draft.body = body ?? '';
  draft.authMode = 'none';
  return draft;
}
function response(status, body, headers = [], durationMs = 11) {
  return {
    status, statusText: 'Fixture', durationMs,
    sizeBytes: Buffer.byteLength(body),
    headers: headers.map(([key, value]) => row(key, value)),
    body, contentType: 'application/json', binary: false
  };
}
function fixture() {
  const workspace = initialWorkspace();
  const login = request('login', 'POST', 'http://localhost:3000/auth/login', '{"username":"fake"}');
  const order = request('order', 'POST', 'http://localhost:3000/orders', '{"title":"test"}');
  order.authMode = 'bearer';
  order.bearerToken = '{{token}}';
  const show = request('show', 'GET', 'http://localhost:3000/orders/{{orderId}}');
  show.authMode = 'bearer';
  show.bearerToken = '{{token}}';
  const patch = request('patch', 'PATCH', 'http://localhost:3000/orders/{{orderId}}', '{"state":"shipped"}');
  patch.authMode = 'bearer';
  patch.bearerToken = '{{token}}';
  workspace.collections[0].requests = [login, order, show, patch];
  workspace.selectedEnvironmentId = null;
  return workspace;
}
const scenario = {
  id: 'order-flow',
  name: 'Order flow',
  stopOnFailure: true,
  steps: [
    { id: 'step-login', requestId: 'login', assertions: [{ kind: 'status-equals', expected: 200 }],
      extractions: [{ source: 'json', path: '$.token', variable: 'token', secret: true }] },
    { id: 'step-order', requestId: 'order', assertions: [{ kind: 'status-equals', expected: 201 }],
      extractions: [{ source: 'json', path: '$.id', variable: 'orderId' }] },
    { id: 'step-show', requestId: 'show', assertions: [
      { kind: 'status-equals', expected: 200 }, { kind: 'json-equals', path: '$.state', expected: 'placed' },
      { kind: 'header-contains', name: 'X-Test', expected: 'ok' }, { kind: 'duration-below', milliseconds: 1000 }
    ], extractions: [] },
    { id: 'step-patch', requestId: 'patch', assertions: [
      { kind: 'status-equals', expected: 200 }, { kind: 'json-equals', path: '$.state', expected: 'shipped' }
    ], extractions: [] }
  ]
};

test('script-free four-step login -> token -> orderId -> get -> patch actually sends ordered requests', async () => {
  const workspace = fixture();
  const before = JSON.stringify(workspace);
  const wire = [];
  const transport = async (draft, env, options) => {
    const prepared = prepareRequest(draft, env);
    wire.push({ method: prepared.init.method, url: prepared.url,
      authorization: prepared.init.headers.get('authorization'), body: prepared.init.body });
    assert.equal(options.timeoutMs, 30000);
    const url = new URL(prepared.url);
    if (url.pathname === '/auth/login') return response(200, '{"token":"ultra-private-fake-token"}');
    assert.equal(prepared.init.headers.get('authorization'), 'Bearer ultra-private-fake-token');
    if (url.pathname === '/orders' && prepared.init.method === 'POST') return response(201, '{"id":901}');
    assert.equal(url.pathname, '/orders/901');
    if (prepared.init.method === 'GET') return response(200, '{"state":"placed"}', [['x-test', 'all-ok']]);
    return response(200, '{"state":"shipped"}');
  };
  const result = await runScenario(scenario, workspace, transport);
  assert.deepEqual(result.steps.map(item => item.state), ['passed', 'passed', 'passed', 'passed']);
  assert.equal(result.passed, 4);assert.equal(result.failed, 0);
  assert.equal(wire.length, 4);
  assert.deepEqual(wire.map(item => item.method), ['POST', 'POST', 'GET', 'PATCH']);
  assert.equal(wire[2].url, 'http://localhost:3000/orders/901');
  assert.equal(JSON.stringify(workspace), before, 'the saved workspace must remain immutable');
  assert.ok(!JSON.stringify(result).includes('ultra-private-fake-token'));
  assert.ok(!JSON.stringify(result).includes('901'));
});

test('missing extracted token fails closed and skips dependent requests without sending them', async () => {
  const calls = [];
  const result = await runScenario(scenario, fixture(), async draft => {
    calls.push(draft.id);
    return response(200, '{"missing":"token"}');
  });
  assert.deepEqual(calls, ['login']);
  assert.deepEqual(result.steps.map(item => item.state), ['failed', 'skipped', 'skipped', 'skipped']);
  assert.equal(result.failed, 1);
  assert.equal(result.steps[0].message, 'A response value could not be extracted.');
});

test('invalid expected status fails, but stopOnFailure=false permits independent later requests', async () => {
  const workspace = fixture();
  const two = { ...scenario, stopOnFailure: false, steps: [
    { id: 'first', requestId: 'login', assertions: [{ kind: 'status-equals', expected: 200 }], extractions: [] },
    { id: 'second', requestId: 'login', assertions: [{ kind: 'status-equals', expected: 500 }], extractions: [] }
  ] };
  let count = 0;
  const result = await runScenario(two, workspace, async () => {
    count++;
    return response(200, '{}');
  });
  assert.equal(count, 2);
  assert.deepEqual(result.steps.map(item => item.state), ['passed', 'failed']);
  assert.equal(result.steps[1].checks[0].passed, false);
});

test('default success policy rejects unasserted HTTP failures but allows explicitly asserted expected 401', async () => {
  const workspace = fixture();
  const def = { id: 'status-test', name: 'Status', stopOnFailure: false, steps: [
    { id: 'one', requestId: 'login', assertions: [], extractions: [] },
    { id: 'two', requestId: 'login', assertions: [{ kind: 'status-equals', expected: 401 }], extractions: [] }
  ] };
  const result = await runScenario(def, workspace, async () => response(401, '{}'));
  assert.deepEqual(result.steps.map(item => item.state), ['failed', 'passed']);
});

test('missing runtime variable rejects before transport instead of sending a wrong URL or bearer token', async () => {
  const workspace = fixture();
  const def = { id: 'missing-token', name: 'Missing token', stopOnFailure: true, steps: [
    { id: 'without-login', requestId: 'show', assertions: [], extractions: [] }
  ] };
  let network = 0;
  const result = await runScenario(def, workspace, async () => { network++; return response(200, '{}'); });
  assert.equal(network, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.steps[0].message, 'Required request input or scenario variable is invalid or missing.');
});

test('cancelled run stops all further network calls without exporting values', async () => {
  const controller = new AbortController();
  const workspace = fixture();
  let calls = 0;
  const result = await runScenario(scenario, workspace, async () => {
    calls++;
    controller.abort();
    return response(200, '{"token":"never-export-me"}');
  }, { signal: controller.signal });
  assert.equal(calls, 1);
  assert.deepEqual(result.steps.map(item => item.state), ['cancelled', 'skipped', 'skipped', 'skipped']);
  assert.equal(result.cancelled, 1);
  assert.ok(!JSON.stringify(result).includes('never-export-me'));
});

test('partial extraction never makes an unavailable variable available for later steps', async () => {
  const workspace = fixture();
  const def = { id: 'partial', name: 'Partial', stopOnFailure: false, steps: [
    { id: 'first', requestId: 'login', assertions: [],
      extractions: [{ source: 'json', path: '$.token', variable: 'token', secret: true },
        { source: 'json', path: '$.missing', variable: 'orderId' }] },
    { id: 'second', requestId: 'show', assertions: [], extractions: [] }
  ] };
  let calls = 0;
  const result = await runScenario(def, workspace, async () => {
    calls++;
    return response(200, '{"token":"do-not-leak"}');
  });
  assert.equal(calls, 1, 'the dependent request must never be sent');
  assert.deepEqual(result.steps.map(item => item.state), ['failed', 'failed']);
  assert.ok(!JSON.stringify(result).includes('do-not-leak'));
});

test('header and status extraction work with case-insensitive names', async () => {
  const workspace = fixture();
  const def = { id: 'header-status', name: 'Header status', stopOnFailure: true, steps: [
    { id: 'one', requestId: 'login', assertions: [],
      extractions: [{ source: 'header', name: 'x-run-id', variable: 'runId' },
        { source: 'status', variable: 'statusCode' }] },
    { id: 'two', requestId: 'login', assertions: [], extractions: [] }
  ] };
  let count = 0;
  await runScenario(def, workspace, async (_req, env) => {
    count++;
    if (count === 2) {
      assert.equal(env.variables.find(x => x.key === 'runId')?.value, 'dummy-123');
      assert.equal(env.variables.find(x => x.key === 'statusCode')?.value, '200');
    }
    return response(200, '{}', [['X-Run-ID', 'dummy-123']]);
  });
  assert.equal(count, 2);
});

test('reject invalid/malicious scenario rules and out-of-bounds steps before any network call', async () => {
  const template = JSON.parse(JSON.stringify(scenario));
  for (const invalid of [
    { ...template, steps: [] },
    { ...template, steps: [...template.steps, ...Array(20).fill(template.steps[0])] },
    { ...template, steps: [template.steps[0], template.steps[0]] },
    { ...template, steps: [{ ...template.steps[0], assertions: [{kind:'json-exists',path:'$.__proto__.token()'}] }] },
    { ...template, steps: [{ ...template.steps[0], extractions: [{source:'json',path:'$.token',variable:'__proto__'}] }] },
    { ...template, steps: [{ ...template.steps[0], assertions: [{kind:'untrusted-javascript'}] }] }
  ]) assert.throws(() => validateScenario(invalid));
  let count = 0;
  await assert.rejects(() => runScenario({ ...template, steps: [] }, fixture(), async () => { count++; }));
  assert.equal(count, 0);
});

test('missing saved request produces a redacted failure with no outbound call', async () => {
  const workspace = fixture();
  const def = { id: 'missing', name: 'Missing', stopOnFailure: true, steps: [
    { id: 'step', requestId: 'nonexistent', assertions: [], extractions: [] }
  ] };
  const result = await runScenario(def, workspace, async () => { throw new Error('must not send'); });
  assert.equal(result.failed, 1);
  assert.equal(result.steps[0].message, 'Saved request not found.');
});

test('transport exceptions never expose their raw URL or secrets in scenario reports', async () => {
  const workspace = fixture();
  const def = { id: 'failure', name: 'Failure', stopOnFailure: true, steps: [
    { id: 'one', requestId: 'login', assertions: [], extractions: [] }
  ] };
  const result = await runScenario(def, workspace, async () => {
    throw new Error('https://user:secrets@example.org/?token=even-more-secrets');
  });
  assert.equal(result.failed, 1);
  assert.ok(!JSON.stringify(result).includes('secret'));
});
