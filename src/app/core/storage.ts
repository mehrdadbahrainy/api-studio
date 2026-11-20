import { Workspace, initialWorkspace } from './models';
import { parseWorkspace } from './workspace-utils';
const KEY = 'api-studio.workspace.v1';
export function hasLegacyWorkspace(): boolean {try {return localStorage.getItem(KEY)!==null;} catch {return false;}}
export function removeLegacyWorkspace(): void {try {localStorage.removeItem(KEY);} catch { /* cleanup can be retried on next unlock */ }}
export interface LoadStatus { workspace: Workspace; warning: string; }
export function loadWorkspace(): LoadStatus {
  let raw: string|null;
  try { raw=localStorage.getItem(KEY); }
  catch { return {workspace:initialWorkspace(),warning:'Local storage is unavailable; changes may not persist.'}; }
  if (!raw) return {workspace:initialWorkspace(),warning:''};
  try { return {workspace:parseWorkspace(JSON.parse(raw)),warning:''}; }
  catch { return {workspace:initialWorkspace(),warning:'Saved data could not be read. A fresh workspace was loaded; the previous storage entry was not deleted.'}; }
}
export function saveWorkspace(workspace:Workspace): string {
  try{parseWorkspace(workspace);}
  catch(error){return 'Workspace validation failed. Nothing was saved. '+(error instanceof Error?error.message:'Invalid workspace.');}
  try {localStorage.setItem(KEY,JSON.stringify(workspace));return '';}
  catch {return 'Local storage is full or unavailable. Export your workspace to avoid losing changes.';}
}
export function downloadJson(data:unknown,filename:string): void {
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}
