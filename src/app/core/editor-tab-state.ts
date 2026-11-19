import { RequestDraft, Workspace } from './models';

/**
 * UI-only tab restoration metadata. Only opaque request IDs are stored here.
 * Never persist drafts, URLs, headers, bodies, credentials or response data.
 */
export const TAB_PREFS_KEY = 'api-studio.editor-tabs.v1';
export const MAX_EDITOR_TABS = 12;
export interface TabPreferences { requestIds: string[]; activeRequestId: string | null; }
export type TabPreferenceStore = Pick<Storage, 'getItem' | 'setItem'>;

const EMPTY: TabPreferences = {requestIds:[],activeRequestId:null};
export function parseTabPreferences(raw:string|null):TabPreferences {
  if(!raw || raw.length>4096)return {...EMPTY,requestIds:[]};
  try{
    const v:unknown=JSON.parse(raw);
    if(!v || typeof v!=='object' || Array.isArray(v))return {...EMPTY,requestIds:[]};
    const object=v as Record<string,unknown>;
    const ids=Array.isArray(object.requestIds)?object.requestIds:[];
    const valid=ids.filter((id):id is string=>typeof id==='string' && id.length>0 && id.length<=128);
    const distinct=[...new Set(valid)].slice(0,MAX_EDITOR_TABS);
    const active=typeof object.activeRequestId==='string' && distinct.includes(object.activeRequestId)?object.activeRequestId:null;
    return {requestIds:distinct,activeRequestId:active};
  }catch{return {...EMPTY,requestIds:[]};}
}
export function readTabPreferences(store:TabPreferenceStore|null|undefined):TabPreferences {
  try{return parseTabPreferences(store?.getItem(TAB_PREFS_KEY)??null);}
  catch{return {...EMPTY,requestIds:[]};}
}
export function writeTabPreferences(store:TabPreferenceStore|null|undefined,prefs:TabPreferences):void {
  try{store?.setItem(TAB_PREFS_KEY,JSON.stringify(parseTabPreferences(JSON.stringify(prefs))));}
  catch{ /* UI-only state is non-critical. Never block vault saving. */ }
}
export function resolveSavedTabIds(workspace:Workspace,prefs:TabPreferences):string[] {
  const available=new Set(workspace.collections.flatMap(c=>c.requests.map(r=>r.id)));
  return prefs.requestIds.filter(id=>available.has(id));
}
/** Compare the full edit payload, including destination Collection, without recording secrets in storage. */
export function requestIsDirty(draft:RequestDraft,saved:RequestDraft|null,destinationId:string|null):boolean {
  if(!saved)return true;
  const current={...draft,collectionId:destinationId};
  return JSON.stringify(current)!==JSON.stringify(saved);
}
