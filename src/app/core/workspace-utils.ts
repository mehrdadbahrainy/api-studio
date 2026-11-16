import { Collection, Environment, HistoryEntry, KeyValue, RequestDraft, Workspace, copyRequest, freshRequest, initialWorkspace, makeId } from './models';
const MAX_COLLECTIONS = 150;
const MAX_REQUESTS = 2000;
const MAX_HISTORY = 80;
export function cleanRows(raw: unknown): KeyValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0,200).filter(x=>x && typeof x === 'object').map(x=>({id:typeof x.id === 'string'?x.id:makeId(),enabled:x.enabled!==false,key:String(x.key??'').slice(0,512),value:String(x.value??'').slice(0,100000)}));
}
export function parseWorkspace(raw: unknown): Workspace {
  if (!raw || typeof raw !== 'object' || (raw as {version?:unknown}).version !== 1) throw new Error('Not an API Studio workspace (version 1).');
  const input = raw as Record<string,any>;
  if (!Array.isArray(input.collections) || !Array.isArray(input.environments)) throw new Error('Workspace must contain collections and environments.');
  const methods = new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
  const bodyModes = new Set(['none','json','text','urlencoded','formdata']);
  const authModes = new Set(['none','bearer','basic']);
  let count=0;
  const parseRequest = (r:any,collectionId:string|null):RequestDraft=>{
    if (!r || typeof r!=='object') throw new Error('Invalid saved request.');
    count++;if(count>MAX_REQUESTS) throw new Error('Workspace contains too many requests.');
    const d=freshRequest();
    d.id=typeof r.id==='string'?r.id:makeId();d.collectionId=collectionId;
    d.name=String(r.name??'Untitled request').slice(0,160);
    d.method=methods.has(r.method)?r.method:'GET';d.url=String(r.url??'').slice(0,16000);
    d.params=cleanRows(r.params);d.headers=cleanRows(r.headers);
    d.bodyMode=bodyModes.has(r.bodyMode)?r.bodyMode:'none';d.body=String(r.body??'').slice(0,2_000_000);d.formData=cleanRows(r.formData);
    d.authMode=authModes.has(r.authMode)?r.authMode:'none';d.bearerToken=String(r.bearerToken??'').slice(0,10000);
    d.basicUsername=String(r.basicUsername??'').slice(0,1000);d.basicPassword=String(r.basicPassword??'').slice(0,10000);
    return d;
  };
  const collections:Collection[]=input.collections.slice(0,MAX_COLLECTIONS).map((c:any)=>{
    if(!c || typeof c!=='object') throw new Error('Invalid collection.');
    const id=typeof c.id==='string'?c.id:makeId();
    return {id,name:String(c.name??'Untitled collection').slice(0,120),requests:Array.isArray(c.requests)?c.requests.map((r:any)=>parseRequest(r,id)):[]};
  });
  const environments:Environment[]=input.environments.slice(0,80).map((e:any)=>({id:typeof e?.id==='string'?e.id:makeId(),name:String(e?.name??'Environment').slice(0,120),variables:cleanRows(e?.variables)}));
  const history:HistoryEntry[]=Array.isArray(input.history)?input.history.slice(0,MAX_HISTORY).filter((h:any)=>h && typeof h==='object').map((h:any)=>({id:typeof h.id==='string'?h.id:makeId(),at:String(h.at??''),request:redactHistoryRequest(parseRequest(h.request??{},null)),status:typeof h.status==='number'?h.status:null,durationMs:typeof h.durationMs==='number'?h.durationMs:null})):[];
  const selectedEnvironmentId=environments.some(e=>e.id===input.selectedEnvironmentId)?input.selectedEnvironmentId:null;
  return {version:1,collections,environments,selectedEnvironmentId,history};
}
export function safeLoad(raw:string|null): Workspace {
  if (!raw) return initialWorkspace();
  try { return parseWorkspace(JSON.parse(raw)); } catch { return initialWorkspace(); }
}
/** History is navigation metadata, not a second credential/request-body store. */
const PRIVATE_FIELD = /(?:auth(?:orization)?|bearer|token|secret|pass(?:word)?|api[-_]?key|cookie|session|credential|client[-_]?secret|access[-_]?key|signature|jwt)/i;
function cleanHistoryUrl(input: string): string {
  try {
    const url = new URL(input);
    for (const key of url.searchParams.keys()) url.searchParams.set(key, '');
    url.username=''; url.password=''; url.hash='';
    return url.toString();
  } catch {
    const [path, query] = input.split('?', 2);
    if (!query) return path;
    return `${path}?${query.split('&').map(item => `${item.split('=',1)[0]}=`).join('&')}`;
  }
}
export function redactHistoryRequest(request: RequestDraft): RequestDraft {
  const safe = copyRequest(request);
  safe.url = cleanHistoryUrl(safe.url);
  safe.bearerToken=''; safe.basicUsername=''; safe.basicPassword=''; safe.authMode='none';
  safe.headers = safe.headers.filter(item => !PRIVATE_FIELD.test(item.key) && !PRIVATE_FIELD.test(item.value));
  safe.params = safe.params.map(item => ({...item, value: ''}));
  safe.formData = safe.formData.map(item => ({...item, value: ''}));
  safe.body = ''; safe.bodyMode = 'none';
  return safe;
}
export function addHistory(history: HistoryEntry[], request: RequestDraft, status: number|null,durationMs:number|null): HistoryEntry[] {
  const entry:HistoryEntry={id:makeId(),at:new Date().toISOString(),request:redactHistoryRequest(request),status,durationMs};
  return [entry,...history].slice(0,MAX_HISTORY);
}
