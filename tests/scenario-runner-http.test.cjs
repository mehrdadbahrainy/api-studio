const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { freshRequest, initialWorkspace, row } = require('../.test-dist/models.js');
const { prepareRequest } = require('../.test-dist/request-utils.js');
const { runScenario } = require('../.test-dist/scenario-runner.js');

function saved(id, method, url, body = '') {
  const request = freshRequest();
  Object.assign(request, { id, name: id, method, url, headers: [], params: [], bodyMode: body ? 'json' : 'none', body });
  return request;
}

test('scenario engine executes a real four-step local HTTP order flow and never reports secrets', async () => {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const requestBody = Buffer.concat(chunks).toString();
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? '' });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/auth/login' && req.method === 'POST') {
      assert.deepEqual(JSON.parse(requestBody), { username: 'fixture' });
      res.end(JSON.stringify({ token: 'private-fixture-token' }));
    } else if (req.url === '/orders' && req.method === 'POST' && req.headers.authorization === 'Bearer private-fixture-token') {
      res.statusCode = 201;
      res.end(JSON.stringify({ id: 88 }));
    } else if (req.url === '/orders/88' && req.method === 'GET' && req.headers.authorization === 'Bearer private-fixture-token') {
      res.setHeader('x-result', 'fixture-pass');
      res.end(JSON.stringify({ state: 'placed' }));
    } else if (req.url === '/orders/88' && req.method === 'PATCH' && req.headers.authorization === 'Bearer private-fixture-token') {
      assert.deepEqual(JSON.parse(requestBody), { state: 'shipped' });
      res.end(JSON.stringify({ state: 'shipped' }));
    } else {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'denied' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const requests = [
      saved('login', 'POST', base + '/auth/login', '{"username":"fixture"}'),
      saved('create', 'POST', base + '/orders', '{"title":"fixture"}'),
      saved('read', 'GET', base + '/orders/{{orderId}}'),
      saved('ship', 'PATCH', base + '/orders/{{orderId}}', '{"state":"shipped"}')
    ];
    for (const r of requests.slice(1)) {
      r.authMode = 'bearer';
      r.bearerToken = '{{token}}';
    }
    const workspace = initialWorkspace();
    workspace.collections[0].requests = requests;
    workspace.selectedEnvironmentId = null;
    const originalWorkspace = JSON.stringify(workspace);
    const scenario = {
      id: 'local-flow', name: 'Local order flow', stopOnFailure: true, steps: [
        { id: 'login-step', requestId: 'login', assertions: [{kind:'status-equals', expected:200}],
          extractions: [{source:'json', path:'$.token', variable:'token', secret:true}] },
        { id: 'create-step', requestId: 'create', assertions: [{kind:'status-equals', expected:201}],
          extractions: [{source:'json', path:'$.id', variable:'orderId'}] },
        { id: 'read-step', requestId: 'read', assertions: [
          {kind:'status-equals', expected:200}, {kind:'json-equals', path:'$.state', expected:'placed'},
          {kind:'header-contains', name:'x-result', expected:'fixture-pass'}], extractions:[] },
        { id: 'ship-step', requestId: 'ship', assertions: [
          {kind:'status-equals', expected:200}, {kind:'json-equals', path:'$.state', expected:'shipped'}], extractions:[] }
      ]
    };
    const realHttpSender = async (draft, env, options) => {
      const { url, init } = prepareRequest(draft, env);
      const started = performance.now();
      const response = await fetch(url, { ...init, signal: options.signal });
      const body = await response.text();
      return {
        status: response.status, statusText: response.statusText,
        durationMs: Math.round(performance.now() - started),
        sizeBytes: Buffer.byteLength(body),
        headers: [...response.headers.entries()].map(([key,value]) => row(key,value)),
        body, contentType: response.headers.get('content-type') ?? '', binary: false
      };
    };
    const result = await runScenario(scenario, workspace, realHttpSender);
    assert.equal(result.passed, 4);
    assert.equal(result.failed, 0);
    assert.deepEqual(seen.map(item => item.method), ['POST','POST','GET','PATCH']);
    assert.equal(seen[2].url, '/orders/88');
    assert.equal(JSON.stringify(workspace), originalWorkspace);
    assert.ok(!JSON.stringify(result).includes('private-fixture-token'));
    assert.ok(!JSON.stringify(result).includes('/orders/88'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
