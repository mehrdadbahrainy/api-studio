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
