import { Collection, Folder, RequestDraft, Workspace, makeId } from './models';
export const MAX_FOLDERS=150;
export interface NavigationItem {
  key:string; folder:Folder|null; collection:Collection|null; requests:RequestDraft[]; label:string; depth:number;
}
export function ensureFolderPath(current:Folder[],parts:string[]):{folders:Folder[];id:string|null} {
  if(parts.length>20)throw new Error('Folder nesting is limited to 20 levels.');
  const next=current.map(f=>({...f}));
  let parentId:string|null=null;
  for(const original of parts){
    const name=original.trim();
    if(!name||name.length>120)throw new Error('Folder names must contain 1–120 characters.');
    let found=next.find(f=>f.parentId===parentId&&f.name.toLowerCase()===name.toLowerCase());
    if(!found){
      if(next.length>=MAX_FOLDERS)throw new Error('Workspace folder limit reached (150 folders).');
      found={id:makeId(),name,parentId};next.push(found);
    }
    parentId=found.id;
  }
  return {folders:next,id:parentId};
}
export function folderBreadcrumb(folders:Folder[],id:string|null|undefined):string {
  const names:string[]=[];let next=id??null;const seen=new Set<string>();
  while(next&&!seen.has(next)&&names.length<20){
    seen.add(next);
    const f=folders.find(f=>f.id===next);
    if(!f)break;
    names.unshift(f.name);next=f.parentId;
  }
  return names.join(' / ');
}
/** Flattening, rather than a recursive template, supports arbitrary folder depth safely. */
export function collectionNavigation(workspace:Workspace,filter:string,collapsed:Set<string>):NavigationItem[] {
  const folders=workspace.folders??[];
  const q=filter.trim().toLowerCase();
  const rows:NavigationItem[]=[];
  const visited=new Set<string>();
  const folderByParent=(id:string|null)=>folders.filter(f=>f.parentId===id);
  const collectionsByParent=(id:string|null)=>workspace.collections.filter(c=>(c.folderId??null)===id);
  const descendantsMatch=(id:string,ancestorsMatch=false):boolean=>{
    const f=folders.find(x=>x.id===id);
    if(!f)return false;
    const match=ancestorsMatch||f.name.toLowerCase().includes(q);
    if(!q||match)return true;
    if(collectionsByParent(id).some(c=>collectionMatches(c)))return true;
    return folderByParent(id).some(c=>descendantsMatch(c.id,match));
  };
  const collectionMatches=(c:Collection):boolean=>!q||c.name.toLowerCase().includes(q)||
    c.requests.some(r=>(r.name+' '+r.method+' '+r.url).toLowerCase().includes(q));
  const addFolder=(folder:Folder,depth:number,ancestorsMatch=false):void=>{
    if(visited.has(folder.id))return;
    if(!descendantsMatch(folder.id,ancestorsMatch))return;
    visited.add(folder.id);
    rows.push({key:'folder:'+folder.id,folder,collection:null,requests:[],label:folder.name,depth});
    if(collapsed.has(folder.id)&&!q)return;
    const match=ancestorsMatch||!!q&&folder.name.toLowerCase().includes(q);
    for(const child of folderByParent(folder.id))addFolder(child,depth+1,match);
    for(const collection of collectionsByParent(folder.id))addCollection(collection,depth+1,match);
  };
  const addCollection=(c:Collection,depth:number,ancestorMatches=false):void=>{
    if(!ancestorMatches&&!collectionMatches(c))return;
    const requests=!q||ancestorMatches||c.name.toLowerCase().includes(q)?c.requests:
      c.requests.filter(r=>(r.name+' '+r.method+' '+r.url).toLowerCase().includes(q));
    rows.push({key:'collection:'+c.id,collection:c,folder:null,requests,label:c.name,depth});
  };
  for(const folder of folderByParent(null))addFolder(folder,0);
  for(const collection of collectionsByParent(null))addCollection(collection,0);
  // Workspaces from older or hand-edited backups may contain orphaned references;
  // expose them at root instead of hiding valuable collections.
  for(const collection of workspace.collections){
    if(collection.folderId&&!folders.some(f=>f.id===collection.folderId))addCollection(collection,0);
  }
  return rows;
}
