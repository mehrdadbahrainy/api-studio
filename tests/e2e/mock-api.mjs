import http from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.API_STUDIO_TEST_PORT || '4311');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'X-Test-Server');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ready');
    return;
  }
  if (url.pathname === '/slow-body') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Test-Server': 'api-studio' });
    res.flushHeaders();
    res.write('first-');
    const timer = setTimeout(() => res.end('last'), Number(url.searchParams.get('ms') || 700));
    res.on('close', () => clearTimeout(timer));
    return;
  }
  if (url.pathname === '/delay') {
    const timer = setTimeout(() => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('delayed'); }, Number(url.searchParams.get('ms') || 2000));
    res.on('close', () => clearTimeout(timer));
    return;
  }
  if (url.pathname.startsWith('/status/')) {
    const status = Number(url.pathname.split('/').pop());
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(status === 204 || status === 304 ? undefined : 'status-' + status);
    return;
  }
  if (url.pathname === '/redirect') {
    res.writeHead(302, { Location: '/echo?redirected=yes' }); res.end(); return;
  }
  if (url.pathname === '/payload') {
    const kind = url.searchParams.get('kind');
    const payloads = {
      json: ['application/json', '{"message":"سلام","ok":true}'],
      invalid: ['application/json', '{invalid'],
      xml: ['application/xml', '<root><item>hello</item></root>'],
      html: ['text/html', '<html><body><script>window.qaInjected=true</script><img src="/should-not-load" onerror="window.qaInjected=true"><p>Hello</p></body></html>'],
      text: ['text/plain', 'plain response'],
      binary: ['application/octet-stream', 'binary'],
      large: ['text/plain', 'x'.repeat(600_000)],
      oversized: ['text/plain', 'x'.repeat(5 * 1024 * 1024 + 1)],
    };
    const [type, value] = payloads[kind] || payloads.text;
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(value) });
    res.end(value); return;
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) {
      res.writeHead(413);
      res.end('test payload too large');
      return;
    }
  }
  const result = {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    contentType: req.headers['content-type'] || null,
    headers: req.headers,
  };
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Test-Server': 'api-studio' });
  res.end(JSON.stringify(result));
});
server.listen(port, host, () => console.log(`API Studio E2E fixture running on http://${host}:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
