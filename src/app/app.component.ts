import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { SecureWorkspace, describeVaultError } from './core/secure-workspace';
import { SystemWorkspace } from './core/system-workspace';
import { MAX_EDITOR_TABS, readTabPreferences, requestIsDirty, resolveSavedTabIds, writeTabPreferences } from './core/editor-tab-state';
import { COLLAPSED_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH, clampSidebarWidth, readSidebarPreferences, writeSidebarPreferences } from './core/sidebar-state';
import { checkForUpdates, RELEASES_PAGE } from './core/update-check';
import { ResponseMode, ResponsePreview, responsePreview, responseFileName } from './core/response-viewer';
import { Folder } from './core/models';
import { collectionNavigation, ensureFolderPath, folderBreadcrumb, NavigationItem } from './core/folder-utils';
import { CHANGELOG_URL, DOCUMENTATION_URL, ISSUES_URL, LICENSE_URL, PERSIAN_GUIDE_URL, SOURCE_REPOSITORY, UpdateStatus } from './core/release-catalog';
import { executeRequest } from './core/http-transport';
import { loadWorkspace, saveWorkspace, downloadJson } from './core/storage';
import { addHistory } from './core/workspace-utils';
import { parseImportedJson } from './core/import-json';
import { activeVariables, readableBytes, RequestValidationError } from './core/request-utils';
import { RequestTransportError } from './core/network-errors';
import { AuthMode, BodyMode, Collection, EditorTab, Environment, HistoryEntry, HttpMethod, HttpResult, KeyValue, RequestDraft, ResponseTab, Workspace, copyRequest, freshRequest, initialWorkspace, makeId, row } from './core/models';

interface OpenRequestTab {
  key: string;
  savedId: string | null;
  draft: RequestDraft;
  collectionId: string | null;
  response: HttpResult | null;
  error: string;
  editorTab: EditorTab;
  responseTab: ResponseTab;
  responseMode:ResponseMode;
}

@Component({
  selector:'app-root',standalone:true,imports:[CommonModule,FormsModule],
  templateUrl:'./app.component.html',styleUrl:'./app.component.scss'
})
export class AppComponent implements OnDestroy {
  readonly methods:HttpMethod[]=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
  readonly isDesktop=isTauri();
  readonly bytes=readableBytes;
  readonly releasesPage=RELEASES_PAGE;
  readonly sourcePage=SOURCE_REPOSITORY;
  readonly docsPage=DOCUMENTATION_URL;
  readonly persianGuidePage=PERSIAN_GUIDE_URL;
  readonly changelogPage=CHANGELOG_URL;
  readonly issuesPage=ISSUES_URL;
  readonly licensePage=LICENSE_URL;
  readonly version='0.2.0';
  readonly collapsedSidebarWidth=COLLAPSED_SIDEBAR_WIDTH;
  vaultLocked=false;
  vaultStarting=false;
  vaultFatal=false;
  vaultMode:'system'|'password'='password';
  showSecurityDialog=false;
  securityWorking=false;
  securityError='';
  newVaultPassphrase='';
  vaultWorking=false;
  vaultPassphrase='';
  vaultError='';
  checkingUpdates=false;
  showHelp=false;
  updateStatus:UpdateStatus|null=null;
  updateInfo='';
  updateCheckError='';
  private secureWorkspace:SecureWorkspace|SystemWorkspace|null=null;
  workspace:Workspace;
  draft:RequestDraft;
  activeRequestId:string|null=null;
  activeCollectionId:string|null=null;
  editorTab:EditorTab='params';
  responseTab:ResponseTab='body';
  responseMode:ResponseMode='formatted';
  sidebarTab:'collections'|'history'='collections';
  requestTabs:OpenRequestTab[]=[];
  activeTabKey='';
  pendingCloseTabKey:string|null=null;
  sidebarWidth=DEFAULT_SIDEBAR_WIDTH;
  sidebarCollapsed=false;
  isResizingSidebar=false;
  collapsedCollectionIds=new Set<string>();
  collapsedFolderIds=new Set<string>();
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
    const savedLayout=readSidebarPreferences(typeof localStorage==='undefined'?null:localStorage);
    this.sidebarWidth=clampSidebarWidth(savedLayout.width,typeof window==='undefined'?1440:window.innerWidth);
    this.sidebarCollapsed=savedLayout.collapsed;
    this.collapsedCollectionIds=new Set(savedLayout.collapsedCollectionIds);
    this.vaultLocked=this.isDesktop;
    this.vaultStarting=this.isDesktop;
    const state=this.isDesktop ? {workspace:initialWorkspace(),warning:''} : loadWorkspace();
    this.workspace=state.workspace;this.warning=state.warning;
    const first=this.workspace.collections.flatMap(c=>c.requests)[0];
    this.draft=first?copyRequest(first):freshRequest();
    this.activeRequestId=first?.id??null;
    this.activeCollectionId=first?.collectionId??null;
    if(!this.isDesktop)this.restoreRequestTabs();
    if(this.isDesktop){
      void this.initializeDesktop();
      void this.checkUpdates(true);
    }
  }
  ngOnDestroy():void {this.controller?.abort();if(this.notificationTimer)clearTimeout(this.notificationTimer);this.isResizingSidebar=false;}
  private openWorkspace(workspace:Workspace, vault:SecureWorkspace|SystemWorkspace, mode:'system'|'password'):void {
    this.secureWorkspace=vault;
    this.workspace=workspace;
    const first=workspace.collections.flatMap(c=>c.requests)[0];
    this.draft=first?copyRequest(first):freshRequest();
    this.activeRequestId=first?.id??null;
    this.activeCollectionId=first?.collectionId??null;
    this.vaultPassphrase='';
    this.vaultMode=mode;
    this.vaultLocked=false;
    this.vaultError='';
    this.restoreRequestTabs();
  }
  private async initializeDesktop():Promise<void> {
    try {
      const opened=await SystemWorkspace.openOrCreate();
      if(opened) {
        this.openWorkspace(opened.workspace,opened.vault,'system');
        if(opened.migrated)this.inform('Previous workspace was safely migrated to Windows-protected storage.');
      }
      // null means either non-Windows desktop or an existing v0.1.2 password vault.
      // Do not overwrite that vault: the user must enter the existing passphrase once.
    } catch(error:unknown) {
      this.vaultFatal=true;
      this.vaultError=describeVaultError(error);
    } finally { this.vaultStarting=false; }
  }
  async unlockVault():Promise<void> {
    if (!this.isDesktop || this.vaultWorking || this.vaultStarting || this.vaultFatal)return;
    this.vaultError='';this.vaultWorking=true;
    try {
      const opened=await SecureWorkspace.unlock(this.vaultPassphrase);
      if(await SystemWorkspace.supported() && !await invoke<boolean>('password_mode_enabled')) {
        // Migration is additive and verified. The v0.1.2 encrypted file remains
        // untouched as a private recovery snapshot; Windows-protected storage
        // becomes canonical on the next launch.
        const system=await SystemWorkspace.create(opened.workspace);
        this.openWorkspace(opened.workspace,system,'system');
        this.inform('Workspace unlocked and migrated. Future Windows starts need no app password.');
      } else {
        this.openWorkspace(opened.workspace,opened.vault,'password');
        if(opened.migrated)this.inform('Previous workspace was securely migrated.');
      }
    }catch(error:unknown){this.vaultError=describeVaultError(error);}
    finally{this.vaultWorking=false;}
  }
  async enablePassphrase():Promise<void> {
    if(!this.isDesktop || this.vaultLocked || this.securityWorking || this.newVaultPassphrase.length<12)return;
    this.securityError='';this.securityWorking=true;
    try {
      const vault=await SecureWorkspace.createWithPassphrase(this.newVaultPassphrase,this.workspace);
      // Remove the passwordless copy ONLY after a verified encrypted save.
      await invoke('remove_protected_workspace');
      this.secureWorkspace=vault;
      this.vaultMode='password';
      await invoke('set_password_mode',{enabled:true});
      this.vaultMode='password';
      this.newVaultPassphrase='';
      this.showSecurityDialog=false;
      this.inform('Passphrase protection enabled. It will be required at the next start.');
    }catch(error:unknown){this.securityError=describeVaultError(error);}
    finally{this.securityWorking=false;}
  }
  async disablePassphrase():Promise<void> {
    if(!this.isDesktop || this.vaultLocked || this.securityWorking)return;
    this.securityError='';this.securityWorking=true;
    try {
      if(!await SystemWorkspace.supported())throw new Error('Windows protection unavailable.');
      // Disarm the opt-in marker before writing the passwordless copy. If
      // Windows storage fails, the encrypted vault remains safe for retry.
      await invoke('set_password_mode',{enabled:false});
      const vault=await SystemWorkspace.create(this.workspace);
      this.secureWorkspace=vault;
      this.vaultMode='system';
      this.showSecurityDialog=false;
      this.inform('Passwordless Windows-protected storage enabled.');
    }catch(error:unknown){this.securityError=describeVaultError(error);}
    finally{this.securityWorking=false;}
  }
  openHelp():void { this.showMenu=false;this.showHelp=true; }
  async openProjectLink(event:MouseEvent,url:string):Promise<void> {
    if(!this.isDesktop)return;
    event.preventDefault();
    try{await invoke('open_project_link',{url});}
    catch{this.inform('Could not open your browser. Copy the GitHub URL from the Help page.');}
  }
  async checkUpdates(silent=false):Promise<void> {
    if(this.checkingUpdates)return;
    this.closePopup();this.checkingUpdates=true;this.updateCheckError='';
    try {
      this.updateStatus=await checkForUpdates(this.version);
      this.updateInfo=this.updateStatus.updateAvailable
        ? 'Update available: '+this.updateStatus.latestVersion
        : this.updateStatus.latestVersion
          ? 'Up to date. Latest stable: '+this.updateStatus.latestVersion
          : 'No stable release has been published yet.';
    }catch{
      this.updateCheckError='Could not reach GitHub Releases. Check your network and retry.';
      if(!silent)this.updateInfo=this.updateCheckError;
    }finally{this.checkingUpdates=false;}
  }
  get activeEnvironment():Environment|undefined {return this.workspace.environments.find(x=>x.id===this.workspace.selectedEnvironmentId);}
  get activeCollection():Collection|undefined {return this.workspace.collections.find(x=>x.id===this.activeCollectionId);}
  get totalRequests():number {return this.workspace.collections.reduce((a,c)=>a+c.requests.length,0);}
  get isSaved():boolean{return !!this.activeRequestId;}
  get requestTitle():string{return this.draft.name || 'Untitled request';}
  get canHaveBody():boolean{return this.draft.method!=='GET'&&this.draft.method!=='HEAD';}
  get currentResponsePreview():ResponsePreview|null{return this.response?responsePreview(this.response,this.responseMode):null;}
  get activeVariableCount():number{return Object.keys(activeVariables(this.activeEnvironment)).length;}
  get navigationItems():NavigationItem[] {
    return collectionNavigation(this.workspace,this.filter,this.collapsedFolderIds);
  }
  isFolderExpanded(id:string):boolean{return !!this.filter.trim() || !this.collapsedFolderIds.has(id);}
  toggleFolder(id:string):void {
    if(this.collapsedFolderIds.has(id))this.collapsedFolderIds.delete(id);
    else this.collapsedFolderIds.add(id);
  }
  async createFolder():Promise<void> {
    if(this.vaultLocked)return;
    const raw=window.prompt('Folder path (for example: Team / Orders)', '');
    if(raw===null)return;
    const path=raw.split('/').map(x=>x.trim()).filter(Boolean);
    if(!path.length){this.inform('Enter a folder name.');return;}
    const original=this.workspace.folders;
    try{
      const next=ensureFolderPath(original??[],path);
      if(next.folders.length===(original?.length??0)){this.inform('Folder already exists.');return;}
      this.workspace.folders=next.folders;
      if(!await this.persist()){this.workspace.folders=original;this.error='Could not save folder; workspace was kept unchanged.';return;}
      this.inform('Folder created');
    }catch(e){this.error=e instanceof Error?e.message:'Invalid folder name.';}
  }
  async moveCollectionToFolder(collection:Collection):Promise<void> {
    if(this.vaultLocked || this.running)return;
    const current=folderBreadcrumb(this.workspace.folders??[],collection.folderId);
    const raw=window.prompt('Move Collection to folder path (blank = root)',current);
    if(raw===null)return;
    const path=raw.split('/').map(x=>x.trim()).filter(Boolean);
    const originalFolders=this.workspace.folders;
    const originalId=collection.folderId;
    try{
      const next=ensureFolderPath(originalFolders??[],path);
      collection.folderId=next.id;
      this.workspace.folders=next.folders;
      if(!await this.persist()){
        collection.folderId=originalId;this.workspace.folders=originalFolders;
        this.error='Could not move Collection. Original location was restored.';return;
      }
      this.inform('Collection moved');
    }catch(e){this.error=e instanceof Error?e.message:'Invalid folder path.';}
  }
  async deleteFolder(folder:Folder):Promise<void> {
    if(this.vaultLocked || this.running)return;
    if(!confirm('Remove folder "'+folder.name+'"? Collections and subfolders will move up one level; no requests will be deleted.'))return;
    const original=this.workspace.folders??[];
    const collectionIds=this.workspace.collections.map(c=>c.folderId);
    this.workspace.folders=original.filter(f=>f.id!==folder.id).map(f=>f.parentId===folder.id?{...f,parentId:folder.parentId}:f);
    for(const collection of this.workspace.collections)if(collection.folderId===folder.id)collection.folderId=folder.parentId;
    if(!await this.persist()){
      this.workspace.folders=original;
      this.workspace.collections.forEach((c,i)=>{c.folderId=collectionIds[i]});
      this.error='Could not remove folder; saved data was restored.';return;
    }
    this.collapsedFolderIds.delete(folder.id);
    this.inform('Folder removed, requests preserved');
  }

  get activeRequestTab():OpenRequestTab|undefined { return this.requestTabs.find(t=>t.key===this.activeTabKey); }
  isTabDirty(tab:OpenRequestTab):boolean {
    const saved=tab.savedId?this.workspace.collections.flatMap(c=>c.requests).find(r=>r.id===tab.savedId)??null:null;
    const destination=tab.key===this.activeTabKey?this.activeCollectionId:tab.collectionId;
    return requestIsDirty(tab.draft,saved,destination);
  }
  private newTab(draft:RequestDraft,savedId:string|null,collectionId:string|null):OpenRequestTab {
    return {key:makeId(),savedId,draft:copyRequest(draft),collectionId,response:null,error:'',editorTab:'params',responseTab:'body',responseMode:'formatted'};
  }
  private savedTabPreferences():{requestIds:string[];activeRequestId:string|null} {
    // The active editor may have just been saved before its tab.savedId was
    // synchronized; use the current activeRequestId to avoid losing that tab.
    const ids=this.requestTabs.map(t=>t.key===this.activeTabKey?this.activeRequestId:t.savedId)
      .filter((id):id is string=>!!id && this.workspace.collections.some(c=>c.requests.some(r=>r.id===id)));
    const distinct=[...new Set(ids)].slice(0,MAX_EDITOR_TABS);
    const active=this.activeRequestId && distinct.includes(this.activeRequestId)?this.activeRequestId:null;
    return {requestIds:distinct,activeRequestId:active};
  }
  private rememberOpenRequestTabs():void {
    const preferences=this.savedTabPreferences();
    if(this.isDesktop){
      // localStorage is not reliably flushed by WebView2 during native shutdown.
      // Persist IDs only inside the Windows-protected workspace instead.
      if(this.vaultLocked || !this.secureWorkspace)return;
      this.workspace.openTabState=preferences;
      void this.persist();
    } else {
      writeTabPreferences(typeof localStorage==='undefined'?null:localStorage,preferences);
    }
  }
  private syncActiveRequestTab():void {
    const tab=this.activeRequestTab;
    if(!tab)return;
    tab.draft=this.draft;
    tab.savedId=this.activeRequestId;
    tab.collectionId=this.activeCollectionId;
    tab.response=this.response;
    tab.error=this.error;
    tab.editorTab=this.editorTab;
    tab.responseTab=this.responseTab;
    tab.responseMode=this.responseMode;
  }
  private showRequestTab(tab:OpenRequestTab):void {
    this.activeTabKey=tab.key;
    this.draft=tab.draft;
    this.activeRequestId=tab.savedId;
    this.activeCollectionId=tab.collectionId;
    this.response=tab.response;
    this.error=tab.error;
    this.editorTab=tab.editorTab;
    this.responseTab=tab.responseTab;
    this.responseMode=tab.responseMode;
  }
  private restoreRequestTabs():void {
    const prefs=this.isDesktop && this.workspace.openTabState
      ? this.workspace.openTabState
      : readTabPreferences(typeof localStorage==='undefined'?null:localStorage);
    const ids=resolveSavedTabIds(this.workspace,prefs);
    this.requestTabs=ids.map(id=>{
      const saved=this.workspace.collections.flatMap(c=>c.requests).find(x=>x.id===id)!;
      return this.newTab(saved,id,saved.collectionId);
    });
    if(!this.requestTabs.length){
      const first=this.workspace.collections.flatMap(c=>c.requests)[0];
      this.requestTabs.push(first?this.newTab(first,first.id,first.collectionId):
        this.newTab(freshRequest(),null,this.workspace.collections[0]?.id??null));
    }
    const selected=this.requestTabs.find(t=>t.savedId===prefs.activeRequestId)??this.requestTabs[0];
    this.showRequestTab(selected);
    this.rememberOpenRequestTabs();
  }
  switchRequestTab(key:string):void {
    if(this.activeTabKey===key)return;
    if(this.running){this.inform('Cancel or finish the current request before switching tabs.');return;}
    const tab=this.requestTabs.find(t=>t.key===key);
    if(!tab)return;
    this.syncActiveRequestTab();
    this.showRequestTab(tab);
    this.rememberOpenRequestTabs();
  }
  private openDraftTab(draft:RequestDraft,savedId:string|null,collectionId:string|null):void {
    if(this.running){this.inform('Finish or cancel the running request before opening another tab.');return;}
    if(this.requestTabs.length>=MAX_EDITOR_TABS){this.inform('Close a tab before opening another (12 tab limit).');return;}
    this.syncActiveRequestTab();
    const tab=this.newTab(draft,savedId,collectionId);
    this.requestTabs.push(tab);
    this.showRequestTab(tab);
    this.sidebarTab='collections';
    this.showMenu=false;
    this.rememberOpenRequestTabs();
  }
  requestCloseTab(key:string):void {
    if(this.running){this.inform('Cancel the active request before closing a tab.');return;}
    const tab=this.requestTabs.find(t=>t.key===key);
    if(!tab)return;
    this.syncActiveRequestTab();
    if(this.isTabDirty(tab)){this.pendingCloseTabKey=key;return;}
    this.removeRequestTab(key);
  }
  private removeRequestTab(key:string):void {
    const index=this.requestTabs.findIndex(t=>t.key===key);
    if(index<0)return;
    const wasActive=this.activeTabKey===key;
    this.requestTabs.splice(index,1);
    if(!this.requestTabs.length){
      const first=this.workspace.collections.flatMap(c=>c.requests)[0];
      this.requestTabs.push(first?this.newTab(first,first.id,first.collectionId):
        this.newTab(freshRequest(),null,this.workspace.collections[0]?.id??null));
    }
    if(wasActive)this.showRequestTab(this.requestTabs[Math.min(index,this.requestTabs.length-1)]);
    this.pendingCloseTabKey=null;
    this.rememberOpenRequestTabs();
  }
  async resolveCloseTab(choice:'save'|'discard'|'cancel'):Promise<void> {
    const key=this.pendingCloseTabKey;
    if(!key || choice==='cancel'){this.pendingCloseTabKey=null;return;}
    if(choice==='discard'){this.removeRequestTab(key);return;}
    this.pendingCloseTabKey=null;
    this.switchRequestTab(key);
    await this.saveRequest();
    const tab=this.requestTabs.find(t=>t.key===key);
    if(tab && tab.savedId && !this.isTabDirty(tab))this.removeRequestTab(key);
    else this.pendingCloseTabKey=key;
  }
  onCollectionSelection(id:string|null):void {
    this.activeCollectionId=id;
    const tab=this.activeRequestTab;
    if(tab)tab.collectionId=id;
  }
  renameCurrentRequest():void {
    const name=window.prompt('Request name',this.draft.name);
    if(name===null)return;
    const trimmed=name.trim();
    if(!trimmed){this.inform('Request name cannot be empty.');return;}
    this.draft.name=trimmed.slice(0,160);
  }
  @HostListener('window:beforeunload',['$event'])
  protectUnsavedTabs(event:BeforeUnloadEvent):void {
    if(this.requestTabs.some(t=>this.isTabDirty(t))){
      event.preventDefault();
      event.returnValue='';
    }
  }

  /** UI state never enters encrypted Workspace JSON or its backups. */
  private rememberLayout():void {
    writeSidebarPreferences(typeof localStorage==='undefined'?null:localStorage,{
      width:this.sidebarWidth,collapsed:this.sidebarCollapsed,
      collapsedCollectionIds:[...this.collapsedCollectionIds]
    });
  }
  toggleSidebar():void { this.sidebarCollapsed=!this.sidebarCollapsed;this.rememberLayout(); }
  setSidebarTab(tab:'collections'|'history'):void {
    this.sidebarTab=tab;
    if(this.sidebarCollapsed)this.sidebarCollapsed=false;
    this.rememberLayout();
  }
  isCollectionExpanded(id:string):boolean { return !!this.filter.trim() || !this.collapsedCollectionIds.has(id); }
  toggleCollection(id:string):void {
    if(this.collapsedCollectionIds.has(id))this.collapsedCollectionIds.delete(id);
    else this.collapsedCollectionIds.add(id);
    this.rememberLayout();
  }
  setAllCollectionsExpanded(expanded:boolean):void {
    this.collapsedCollectionIds=expanded?new Set<string>():new Set(this.workspace.collections.map(c=>c.id));
    this.rememberLayout();
  }
  beginSidebarResize(event:PointerEvent):void {
    if(event.button!==0 || this.sidebarCollapsed || (typeof window!=='undefined' && window.innerWidth<=760))return;
    this.isResizingSidebar=true;
    event.preventDefault();
  }
  @HostListener('document:pointermove',['$event'])
  onSidebarPointerMove(event:PointerEvent):void {
    if(!this.isResizingSidebar)return;
    this.sidebarWidth=clampSidebarWidth(event.clientX,window.innerWidth);
    event.preventDefault();
  }
  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  endSidebarResize():void { if(!this.isResizingSidebar)return;this.isResizingSidebar=false;this.rememberLayout(); }
  resizeSidebarFromKeyboard(event:KeyboardEvent):void {
    const keys=['ArrowLeft','ArrowRight','Home','End'];
    if(!keys.includes(event.key))return;
    event.preventDefault();
    if(this.sidebarCollapsed)this.sidebarCollapsed=false;
    if(event.key==='Home')this.sidebarWidth=228;
    else if(event.key==='End')this.sidebarWidth=480;
    else this.sidebarWidth+=event.key==='ArrowRight'?20:-20;
    this.sidebarWidth=clampSidebarWidth(this.sidebarWidth,window.innerWidth);
    this.rememberLayout();
  }
  @HostListener('window:resize')
  onWindowResize():void { if(typeof window!=='undefined')this.sidebarWidth=clampSidebarWidth(this.sidebarWidth,window.innerWidth); }
  trackId(_index:number,item:{id:string}):string{return item.id;}
  closePopup():void{this.showMenu=false;}
  inform(text:string):void {this.notice=text;if(this.notificationTimer)clearTimeout(this.notificationTimer);this.notificationTimer=setTimeout(()=>this.notice='',2800);}
  async persist():Promise<boolean> {
    if (this.isDesktop) {
      if (this.vaultLocked || !this.secureWorkspace) return false;
      // Snapshot active editor IDs at every committed write, including Save
      // Request, before the tab.savedId catches up. No drafts are stored here.
      this.workspace.openTabState=this.savedTabPreferences();
      try {
        await this.secureWorkspace.save(this.workspace);
        this.warning='';
        return true;
      } catch {
        this.warning='Encrypted workspace save failed. Your latest changes may not be stored. Export a private backup before closing.';
        return false;
      }
    }
    const err=saveWorkspace(this.workspace);
    if(err)this.warning=err;
    return !err;
  }
  newRequest():void {this.openDraftTab(freshRequest(),null,this.workspace.collections[0]?.id??null);}
  selectRequest(item:RequestDraft):void {
    const existing=this.requestTabs.find(t=>t.savedId===item.id);
    if(existing){this.switchRequestTab(existing.key);this.sidebarTab='collections';this.closePopup();return;}
    this.openDraftTab(item,item.id,item.collectionId);
  }
  selectHistory(item:HistoryEntry):void {
    const draft=copyRequest(item.request);
    draft.id=makeId();draft.collectionId=null;
    this.openDraftTab(draft,null,this.workspace.collections[0]?.id??null);
    this.inform('History request loaded. Save it to a collection if needed.');
  }
  createCollection():void {
    const name=this.newCollectionName.trim();if(!name)return;
    const collection:Collection={id:makeId(),name,requests:[]};
    this.workspace.collections.push(collection);this.collapsedCollectionIds.delete(collection.id);this.onCollectionSelection(collection.id);this.newCollectionName='';this.showCreateCollection=false;this.persist();this.inform('Collection created');
  }
  deleteCollection(collection:Collection):void {
    if(this.running){this.inform('Finish the running request first.');return;}
    if(!window.confirm(`Delete "${collection.name}" and all ${collection.requests.length} saved requests? Unsaved tabs in this Collection will also be discarded.`))return;
    this.syncActiveRequestTab();
    const removedIds=new Set(collection.requests.map(r=>r.id));
    this.workspace.collections=this.workspace.collections.filter(c=>c.id!==collection.id);
    this.collapsedCollectionIds.delete(collection.id);this.rememberLayout();
    this.requestTabs=this.requestTabs.filter(t=>t.collectionId!==collection.id && (!t.savedId || !removedIds.has(t.savedId)));
    if(!this.requestTabs.length){
      const first=this.workspace.collections.flatMap(c=>c.requests)[0];
      this.requestTabs.push(first?this.newTab(first,first.id,first.collectionId):this.newTab(freshRequest(),null,this.workspace.collections[0]?.id??null));
    }
    if(!this.requestTabs.some(t=>t.key===this.activeTabKey))this.showRequestTab(this.requestTabs[0]);
    this.rememberOpenRequestTabs();
    void this.persist();this.inform('Collection removed');
  }
  async saveRequest():Promise<void> {
    if(!this.draft.url.trim()){this.error='Enter a request URL before saving.';return;}
    const destination=this.workspace.collections.find(c=>c.id===this.activeCollectionId)??this.workspace.collections[0];
    if(!destination){this.showCreateCollection=true;this.inform('Create a collection before saving.');return;}
    const previousCollections=this.workspace.collections.map(c=>({id:c.id,requests:c.requests.slice()}));
    const previousDraft=this.draft;
    const previousRequestId=this.activeRequestId;
    const previousDestinationId=this.activeCollectionId;
    const copy=copyRequest(this.draft);copy.collectionId=destination.id;
    const previouslySaved=this.workspace.collections.flatMap(c=>c.requests).find(x=>x.id===this.activeRequestId);
    if(previouslySaved){
      this.workspace.collections.forEach(c=>c.requests=c.requests.filter(r=>r.id!==previouslySaved.id));
      copy.id=previouslySaved.id;
    }else copy.id=makeId();
    destination.requests.push(copy);this.draft=copyRequest(copy);
    this.activeRequestId=copy.id;this.activeCollectionId=destination.id;
    if (!(await this.persist())) {
      for(const previous of previousCollections){
        const collection=this.workspace.collections.find(c=>c.id===previous.id);
        if(collection)collection.requests=previous.requests;
      }
      this.draft=previousDraft;
      this.activeRequestId=previousRequestId;
      this.activeCollectionId=previousDestinationId;
      this.error='Could not save the request. Your unsaved edits remain open; check the workspace warning and retry.';
      return;
    }
    const tab=this.activeRequestTab;
    if(tab){tab.savedId=copy.id;tab.draft=this.draft;tab.collectionId=destination.id;}
    this.rememberOpenRequestTabs();
    this.error='';this.inform('Request saved');
  }
  duplicateRequest():void {
    const copy=copyRequest(this.draft);
    copy.id=makeId();copy.name=`${copy.name} copy`;
    this.openDraftTab(copy,null,this.activeCollectionId);
    this.inform('Save this copy to a collection');
  }
  deleteRequest():void {
    if(this.running){this.inform('Finish the running request first.');return;}
    if(!this.activeRequestId || !confirm('Delete this saved request? Unsaved edits to this request will also be discarded.'))return;
    this.syncActiveRequestTab();
    const deleted=this.activeRequestId;
    for(const c of this.workspace.collections)c.requests=c.requests.filter(r=>r.id!==deleted);
    this.requestTabs=this.requestTabs.filter(t=>t.savedId!==deleted);
    if(!this.requestTabs.length){
      const first=this.workspace.collections.flatMap(c=>c.requests)[0];
      this.requestTabs.push(first?this.newTab(first,first.id,first.collectionId):this.newTab(freshRequest(),null,this.workspace.collections[0]?.id??null));
    }
    if(!this.requestTabs.some(t=>t.key===this.activeTabKey))this.showRequestTab(this.requestTabs[0]);
    this.rememberOpenRequestTabs();
    void this.persist();this.inform('Request deleted');
  }
  createRow(items:KeyValue[]):void {items.push(row());}
  removeRow(items:KeyValue[],id:string):void {const i=items.findIndex(x=>x.id===id);if(i>=0)items.splice(i,1);}
  createEnvironment():void {const environment:Environment={id:makeId(),name:'New environment',variables:[row('baseUrl','http://localhost:3000')]};this.workspace.environments.push(environment);this.workspace.selectedEnvironmentId=environment.id;this.persist();}
  removeEnvironment(id:string):void {if(!confirm('Delete this environment?'))return;this.workspace.environments=this.workspace.environments.filter(e=>e.id!==id);if(this.workspace.selectedEnvironmentId===id)this.workspace.selectedEnvironmentId=null;this.persist();}
  changeEnvironment(id:string):void {this.workspace.selectedEnvironmentId=id||null;this.persist();}
  toggleEnvironmentDialog():void{this.showEnvironments=!this.showEnvironments;this.showMenu=false;}
  async send():Promise<void> {
    if(this.running || this.vaultLocked)return;
    this.error='';this.response=null;this.responseTab='body';this.responseMode='formatted';this.running=true;
    this.controller=new AbortController();
    try {
      const result=await executeRequest(this.draft,this.activeEnvironment,{signal:this.controller.signal});
      this.response=result;
      this.workspace.history=addHistory(this.workspace.history,this.draft,result.status,result.durationMs);
      this.persist();
    }catch(err:unknown){
      const message=err instanceof Error?err.message:String(err);
      this.error=this.controller?.signal.aborted
        ? 'Request cancelled.'
        : (err instanceof RequestValidationError || err instanceof RequestTransportError)
          ? message : 'Request failed unexpectedly. Please check the request and try again.';
      this.workspace.history=addHistory(this.workspace.history,this.draft,null,null);this.persist();
    }finally{this.running=false;this.controller=null;}
  }
  cancelRequest():void {this.controller?.abort();}
  async copyResponse():Promise<void>{
    if(!this.response)return;
    const text=this.responseTab==='body'
      ? this.response.body
      : this.response.headers.map(x=>`${x.key}: ${x.value}`).join('\n');
    try{await navigator.clipboard.writeText(text);this.inform('Full response copied to clipboard');}
    catch{this.inform('Could not copy; select the text manually');}
  }
  saveResponse():void {
    if(!this.response)return;
    if(this.response.binary){this.inform('Binary response export is not available in this version.');return;}
    if(!confirm('Response files may contain API keys or private data. Save the full, unencrypted response to your device?'))return;
    const blob=new Blob([this.response.body],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=responseFileName(this.response);anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),500);
    this.inform('Response saved');
  }
  exportWorkspace():void {
    if(!confirm('The backup may include passwords, tokens and API keys in saved requests and environments. Export to a private location?'))return;
    downloadJson(this.workspace,'api-studio-workspace.json');this.closePopup();
  }
  async importWorkspace(event:Event):Promise<void> {
    if(this.running){this.inform('Finish the running request before importing a workspace.');return;}
    const input=event.target as HTMLInputElement;
    const file=input.files?.[0];input.value='';
    if(!file)return;
    if(file.size>8_000_000){this.error='Import file is too large (8 MB limit).';return;}
    try {
      let json:unknown;
      try { json=JSON.parse(await file.text()); }
      catch { throw new Error('Invalid JSON file. Export a valid JSON collection from Postman or API Studio.'); }
      const result=parseImportedJson(json,this.workspace);
      const native=result.kind==='native';
      const prompt=native
        ? 'Replace ALL current collections, environments and history with this API Studio backup? Make an export first if needed.'
        : result.kind==='postman-collection'
          ? 'Add '+result.importedRequests+' Postman requests in '+result.importedCollections+' collections to your existing workspace? No existing collections or history will be removed. Imported JSON may contain secrets.'
          : 'Add this Postman environment to your existing workspace? The imported environment will become active. Imported JSON may contain secrets.';
      if(!confirm(prompt))return;
      const original=this.workspace;
      this.workspace=result.workspace;
      if(!(await this.persist())){
        this.workspace=original;
        this.error='Import was not saved. Existing workspace remains open; check storage permissions and retry.';
        return;
      }
      const first=this.workspace.collections.flatMap(c=>c.requests).find(x=>x.id===result.firstRequestId);
      if(native){this.restoreRequestTabs();}
      if(first)this.selectRequest(first);
      else if(native)this.newRequest();
      this.error='';
      this.warning=result.warnings.length ? 'Postman import limitations: '+result.warnings.join(' ') : '';
      this.inform(native?'Workspace restored':result.kind==='postman-environment'
        ? 'Postman environment added':'Postman collection imported ('+result.importedRequests+' requests)');
    }catch(err:unknown){
      this.error='Import failed: '+(err instanceof Error?err.message:'Unknown file format.');
    }finally{this.closePopup();}
  }
  clearHistory():void{if(!confirm('Clear request history? Saved collections will not be changed.'))return;this.workspace.history=[];this.persist();}
  @HostListener('document:keydown',['$event']) onShortcut(event:KeyboardEvent):void {
    if(this.vaultLocked || !(event.ctrlKey||event.metaKey))return;
    if(event.key==='Enter'){event.preventDefault();void this.send();}
    if(event.key.toLowerCase()==='s'){event.preventDefault();this.saveRequest();}
    if(event.key.toLowerCase()==='n'){event.preventDefault();this.newRequest();}
    if(event.key.toLowerCase()==='w'){event.preventDefault();this.requestCloseTab(this.activeTabKey);}
    if(event.key==='Tab'){
      event.preventDefault();
      const index=this.requestTabs.findIndex(t=>t.key===this.activeTabKey);
      const delta=event.shiftKey?-1:1;
      const next=(index+delta+this.requestTabs.length)%this.requestTabs.length;
      this.switchRequestTab(this.requestTabs[next].key);
    }
  }
  formatDate(value:string):string {const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString();}
  methodStyle(method:HttpMethod):string{return method.toLowerCase();}
  responseStatus():string {const x=this.response?.status;return !x?'':x>=200&&x<300?'success':x>=400?'error':'warning';}
  urlHasVariables():boolean{return /\{\{.+?\}\}/.test(this.draft.url);}
}
