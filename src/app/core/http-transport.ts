import { isTauri } from '@tauri-apps/api/core';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { Environment, HttpResult, RequestDraft, row } from './models';
import { prepareRequest, prettyBody } from './request-utils';
import { describeNetworkError } from './network-errors';

const MAX_DISPLAY_BYTES = 5 * 1024 * 1024;
export interface SendOptions { signal?: AbortSignal; timeoutMs?: number; }
export async function executeRequest(draft: RequestDraft, environment?: Environment, options: SendOptions = {}): Promise<HttpResult> {
  const {url,init} = prepareRequest(draft,environment);
  const start = performance.now();
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  let timedOut = false;
  const onCancel = (): void => controller.abort();
  options.signal?.addEventListener('abort', onCancel, {once:true});
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => {timedOut=true;controller.abort();}, timeoutMs);
  try {
    return await sendWithController(url, init, controller.signal, start);
  } catch (error) {
    throw describeNetworkError(error, {cancelled:!!options.signal?.aborted, timedOut, browser:!isTauri()});
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onCancel);
  }
}
async function sendWithController(url: string, init: RequestInit, signal: AbortSignal, start: number): Promise<HttpResult> {
  const response = await (isTauri() ? nativeFetch : window.fetch)(url, {...init, signal});
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
