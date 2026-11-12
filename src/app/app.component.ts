import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isTauri } from '@tauri-apps/api/core';
import { executeRequest } from './core/http-transport';
import { loadWorkspace, saveWorkspace, downloadJson } from './core/storage';
import { addHistory, parseWorkspace } from './core/workspace-utils';
import { activeVariables, readableBytes, RequestValidationError } from './core/request-utils';
import { AuthMode, BodyMode, Collection, EditorTab, Environment, HistoryEntry, HttpMethod, HttpResult, KeyValue, RequestDraft, ResponseTab, Workspace, copyRequest, freshRequest, makeId, row } from './core/models';

@Component({
  selector:'app-root',standalone:true,imports:[CommonModule,FormsModule],
  templateUrl:'./app.component.html',styleUrl:'./app.component.scss'
})
export class AppComponent implements OnDestroy {
  readonly methods:HttpMethod[]=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
  readonly isDesktop=isTauri();
  readonly bytes=readableBytes;
  workspace:Workspace;
  draft:RequestDraft;
  activeRequestId:string|null=null;
  activeCollectionId:string|null=null;
  editorTab:EditorTab='params';
  responseTab:ResponseTab='body';
  sidebarTab:'collections'|'history'='collections';
  response:HttpResult|null=null;
  running=false;
  error='';
  warning='';
  notice='';
  showEnvironments=false;
  showCreateCollection=false;
  newCollectionName='';
  filter='';
  showMenu=false;
  responseHeight=340;
  private controller:AbortController|null=null;
  private notificationTimer:ReturnType<typeof setTimeout>|null=null;

  constructor() {
    const state=loadWorkspace();this.workspace=state.workspace;this.warning=state.warning;
    const first=this.workspace.collections.flatMap(c=>c.requests)[0];
    this.draft=first?copyRequest(first):freshRequest();
    this.activeRequestId=first?.id??null;
    this.activeCollectionId=first?.collectionId??null;
  }
  ngOnDestroy():void {this.controller?.abort();if(this.notificationTimer)clearTimeout(this.notificationTimer);}
  get activeEnvironment():Environment|undefined {return this.workspace.environments.find(x=>x.id===this.workspace.selectedEnvironmentId);}
  get activeCollection():Collection|undefined {return this.workspace.collections.find(x=>x.id===this.activeCollectionId);}
  get totalRequests():number {return this.workspace.collections.reduce((a,c)=>a+c.requests.length,0);}
  get isSaved():boolean{return !!this.activeRequestId;}
  get requestTitle():string{return this.draft.name || 'Untitled request';}
  get canHaveBody():boolean{return this.draft.method!=='GET'&&this.draft.method!=='HEAD';}
  get activeVariableCount():number{return Object.keys(activeVariables(this.activeEnvironment)).length;}
  get filteredCollections():Collection[] {
    const q=this.filter.trim().toLowerCase();
    if(!q)return this.workspace.collections;
    return this.workspace.collections.map(c=>({...c,requests:c.requests.filter(r=>(r.name+' '+r.method+' '+r.url).toLowerCase().includes(q))})).filter(c=>c.requests.length||c.name.toLowerCase().includes(q));
  }
  trackId(_index:number,item:{id:string}):string{return item.id;}
  closePopup():void{this.showMenu=false;}
  inform(text:string):void {this.notice=text;if(this.notificationTimer)clearTimeout(this.notificationTimer);this.notificationTimer=setTimeout(()=>this.notice='',2800);}
  persist():void {const err=saveWorkspace(this.workspace);if(err)this.warning=err;}
  newRequest():void {this.draft=freshRequest();this.activeRequestId=null;this.activeCollectionId=this.workspace.collections[0]?.id??null;this.response=null;this.error='';this.editorTab='params';this.showMenu=false;}
  selectRequest(item:RequestDraft):void {this.draft=copyRequest(item);this.activeRequestId=item.id;this.activeCollectionId=item.collectionId;this.response=null;this.error='';this.sidebarTab='collections';this.closePopup();}
  selectHistory(item:HistoryEntry):void {this.draft=copyRequest(item.request);this.draft.id=makeId();this.draft.collectionId=null;this.activeRequestId=null;this.activeCollectionId=this.workspace.collections[0]?.id??null;this.response=null;this.error='';this.inform('History request loaded. Save it to a collection if needed.');}
  createCollection():void {
    const name=this.newCollectionName.trim();if(!name)return;
    const collection:Collection={id:makeId(),name,requests:[]};
    this.workspace.collections.push(collection);this.activeCollectionId=collection.id;this.newCollectionName='';this.showCreateCollection=false;this.persist();this.inform('Collection created');
  }
  deleteCollection(collection:Collection):void {
    if(!window.confirm(`Delete "${collection.name}" and all ${collection.requests.length} saved requests?`))return;
    this.workspace.collections=this.workspace.collections.filter(c=>c.id!==collection.id);
    if(this.activeCollectionId===collection.id){this.newRequest();}
    this.persist();this.inform('Collection removed');
  }
  saveRequest():void {
    if(!this.draft.url.trim()){this.error='Enter a request URL before saving.';return;}
    const destination=this.workspace.collections.find(c=>c.id===this.activeCollectionId)??this.workspace.collections[0];
    if(!destination){this.showCreateCollection=true;this.inform('Create a collection before saving.');return;}
    const copy=copyRequest(this.draft);copy.collectionId=destination.id;
    const previouslySaved=this.workspace.collections.flatMap(c=>c.requests).find(x=>x.id===this.activeRequestId);
    if(previouslySaved){
      this.workspace.collections.forEach(c=>c.requests=c.requests.filter(r=>r.id!==previouslySaved.id));
      copy.id=previouslySaved.id;
    }else copy.id=makeId();
    destination.requests.push(copy);this.draft=copyRequest(copy);
    this.activeRequestId=copy.id;this.activeCollectionId=destination.id;
    this.persist();this.error='';this.inform('Request saved');
  }
  duplicateRequest():void {this.draft=copyRequest(this.draft);this.draft.id=makeId();this.draft.name=`${this.draft.name} copy`;this.activeRequestId=null;this.response=null;this.inform('Save this copy to a collection');}
  deleteRequest():void {
    if(!this.activeRequestId || !confirm('Delete this saved request?'))return;
    for(const c of this.workspace.collections)c.requests=c.requests.filter(r=>r.id!==this.activeRequestId);
    this.persist();this.newRequest();this.inform('Request deleted');
  }
  createRow(items:KeyValue[]):void {items.push(row());}
  removeRow(items:KeyValue[],id:string):void {const i=items.findIndex(x=>x.id===id);if(i>=0)items.splice(i,1);}
  createEnvironment():void {const environment:Environment={id:makeId(),name:'New environment',variables:[row('baseUrl','http://localhost:3000')]};this.workspace.environments.push(environment);this.workspace.selectedEnvironmentId=environment.id;this.persist();}
  removeEnvironment(id:string):void {if(!confirm('Delete this environment?'))return;this.workspace.environments=this.workspace.environments.filter(e=>e.id!==id);if(this.workspace.selectedEnvironmentId===id)this.workspace.selectedEnvironmentId=null;this.persist();}
  changeEnvironment(id:string):void {this.workspace.selectedEnvironmentId=id||null;this.persist();}
  toggleEnvironmentDialog():void{this.showEnvironments=!this.showEnvironments;this.showMenu=false;}
  async send():Promise<void> {
    if(this.running)return;
    this.error='';this.response=null;this.responseTab='body';this.running=true;
    this.controller=new AbortController();
    try {
      const result=await executeRequest(this.draft,this.activeEnvironment,{signal:this.controller.signal});
      this.response=result;
      this.workspace.history=addHistory(this.workspace.history,this.draft,result.status,result.durationMs);
      this.persist();
    }catch(err:unknown){
      const message=err instanceof Error?err.message:String(err);
      this.error=err instanceof RequestValidationError?message:`Request failed: ${message}. ${!this.isDesktop?'If the browser blocked it, open the Tauri desktop app to bypass CORS.':''}`;
      this.workspace.history=addHistory(this.workspace.history,this.draft,null,null);this.persist();
    }finally{this.running=false;this.controller=null;}
  }
  cancelRequest():void {this.controller?.abort();}
  async copyResponse():Promise<void>{if(!this.response)return;try{await navigator.clipboard.writeText(this.responseTab==='body'?this.response.body:this.response.headers.map(x=>`${x.key}: ${x.value}`).join('\n'));this.inform('Copied to clipboard');}catch{this.inform('Could not copy; select the text manually');}}
  exportWorkspace():void {
    if(!confirm('The backup may include passwords, tokens and API keys in saved requests and environments. Export to a private location?'))return;
    downloadJson(this.workspace,'api-studio-workspace.json');this.closePopup();
  }
  async importWorkspace(event:Event):Promise<void> {
    const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;
    if(file.size>8_000_000){this.error='Workspace file is too large (8 MB limit).';return;}
    try {
      const parsed=parseWorkspace(JSON.parse(await file.text()));
      if(!confirm('Replace your current collections, environments and history with this backup?'))return;
      this.workspace=parsed;this.persist();const first=parsed.collections.flatMap(c=>c.requests)[0];
      if(first)this.selectRequest(first);else this.newRequest();
      this.inform('Workspace imported');this.error='';
    }catch(err:unknown){this.error='Import failed: '+(err instanceof Error?err.message:String(err));}
    finally{this.closePopup();}
  }
  clearHistory():void{if(!confirm('Clear request history? Saved collections will not be changed.'))return;this.workspace.history=[];this.persist();}
  @HostListener('document:keydown',['$event']) onShortcut(event:KeyboardEvent):void {
    if(!(event.ctrlKey||event.metaKey))return;
    if(event.key==='Enter'){event.preventDefault();void this.send();}
    if(event.key.toLowerCase()==='s'){event.preventDefault();this.saveRequest();}
    if(event.key.toLowerCase()==='n'){event.preventDefault();this.newRequest();}
  }
  formatDate(value:string):string {const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString();}
  methodStyle(method:HttpMethod):string{return method.toLowerCase();}
  responseStatus():string {const x=this.response?.status;return !x?'':x>=200&&x<300?'success':x>=400?'error':'warning';}
  urlHasVariables():boolean{return /\{\{.+?\}\}/.test(this.draft.url);}
}
