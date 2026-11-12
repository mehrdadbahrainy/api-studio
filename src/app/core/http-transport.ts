import { isTauri } from '@tauri-apps/api/core';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { Environment, HttpResult, RequestDraft, row } from './models';
import { prepareRequest, prettyBody } from './request-utils';

const MAX_DISPLAY_BYTES = 5 * 1024 * 1024;
export interface SendOptions { signal?: AbortSignal; }
export async function executeRequest(draft: RequestDraft, environment?: Environment, options: SendOptions = {}): Promise<HttpResult> {
  const {url,init} = prepareRequest(draft,environment);
  const start = performance.now();
  // Tauri's Rust-backed fetch avoids CORS. Browser mode uses standard fetch and obeys CORS.
  const response = await (isTauri() ? nativeFetch : window.fetch)(url, {...init, signal: options.signal});
  const elapsed = Math.round(performance.now() - start);
  const contentType = response.headers.get('content-type') ?? '';
  const reportedLength = Number(response.headers.get('content-length') ?? '0');
  let body: string;
  let sizeBytes: number;
  let binary = false;
  if (reportedLength > MAX_DISPLAY_BYTES) {
    try { await response.body?.cancel(); } catch { /* some native streams do not support cancellation */ }
    body = `Response exceeds the ${MAX_DISPLAY_BYTES / 1048576} MB preview limit. Body not displayed.`;
    sizeBytes = reportedLength;
    binary = true;
  } else {
    const buffer = await response.arrayBuffer();
    sizeBytes = buffer.byteLength;
    if (sizeBytes > MAX_DISPLAY_BYTES) {
      body = `Response exceeds the ${MAX_DISPLAY_BYTES / 1048576} MB preview limit. Body not displayed.`;
      binary = true;
    } else {
      binary = /(?:application\/octet-stream|image\/|audio\/|video\/|application\/pdf)/i.test(contentType);
      body = binary ? 'Binary response received. Body preview is not available in this version.'
        : prettyBody(new TextDecoder('utf-8').decode(buffer), contentType);
    }
  }
  return {status:response.status,statusText:response.statusText,durationMs:elapsed,sizeBytes,headers:[...response.headers.entries()].map(([key,value])=>row(key,value)),body,contentType,binary};
}
