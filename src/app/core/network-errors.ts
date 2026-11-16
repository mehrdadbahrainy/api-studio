export type NetworkFailure = 'cancelled' | 'timeout' | 'dns' | 'tls' | 'connection' | 'unreachable';
export class RequestTransportError extends Error {
  override name = 'RequestTransportError';
  constructor(public readonly kind: NetworkFailure, message: string) { super(message); }
}
export function describeNetworkError(error: unknown, options: {cancelled?: boolean; timedOut?: boolean; browser?: boolean} = {}): RequestTransportError {
  if (options.cancelled) return new RequestTransportError('cancelled', 'Request cancelled.');
  if (options.timedOut) return new RequestTransportError('timeout', 'Request timed out after 30 seconds. Check the server or try again.');
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/certificate|cert[_ ]|tls|ssl|handshake/.test(message)) return new RequestTransportError('tls', 'TLS certificate or secure connection failed. Check the server certificate.');
  if (/dns|enotfound|name.?resolution|could not resolve|no such host/.test(message)) return new RequestTransportError('dns', 'Hostname could not be resolved. Check the address and DNS settings.');
  if (/econnrefused|connection refused/.test(message)) return new RequestTransportError('connection', 'Connection refused. Check that the API server is running and its port is correct.');
  return new RequestTransportError('unreachable', options.browser
    ? 'Could not connect. The server may be offline, or the browser may have blocked the request (CORS). Try the desktop app.'
    : 'Could not connect to the API. Check the URL, network connection, firewall and server availability.');
}
