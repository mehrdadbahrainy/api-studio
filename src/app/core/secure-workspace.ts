import { Workspace } from './models';
import { parseWorkspace } from './workspace-utils';
import { hasLegacyWorkspace, loadWorkspace, removeLegacyWorkspace } from './storage';

/**
 * Desktop encrypted workspace: AES-256-GCM authenticated encryption with a
 * PBKDF2-SHA256 derived key, random 128-bit salt and 96-bit IV. The passphrase
 * and derived key are never serialized. This replaces the crashing v0.1.1
 * native Stronghold plugin; older .stronghold files are never touched.
 */
const STORAGE_KEY = 'api-studio.encrypted-workspace.v2';
const ITERATIONS = 600_000;
type Envelope = { version:2; iterations:number; salt:string; iv:string; ciphertext:string };

function toBase64(bytes:Uint8Array):string {
  let s='';
  for(let i=0;i<bytes.length;i+=8192)
    s+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(s);
}
function fromBase64(text:string):Uint8Array {
  const s=atob(text);
  const result=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++)result[i]=s.charCodeAt(i);
  return result;
}
function parseEnvelope(raw:string):Envelope {
  const e=JSON.parse(raw) as Partial<Envelope>;
  if(!e||e.version!==2||e.iterations!==ITERATIONS||
     typeof e.salt!=='string'||typeof e.iv!=='string'||typeof e.ciphertext!=='string'||
     fromBase64(e.salt).length!==16||fromBase64(e.iv).length!==12)
    throw new Error('Invalid encrypted workspace format');
  return e as Envelope;
}
async function derive(passphrase:string,salt:Uint8Array):Promise<CryptoKey> {
  const input=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:salt as BufferSource,iterations:ITERATIONS,hash:'SHA-256'},
    input,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function decrypt(key:CryptoKey,e:Envelope):Promise<Workspace> {
  try {
    const plaintext=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:fromBase64(e.iv) as BufferSource},
      key,fromBase64(e.ciphertext) as BufferSource);
    return parseWorkspace(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {throw new Error('Invalid passphrase or damaged encrypted workspace');}
}
export function describeVaultError(error:unknown):string {
  const s=(error instanceof Error?error.message:String(error)).toLowerCase();
  if(/at least 12/.test(s))return 'Use a passphrase of at least 12 characters.';
  if(/invalid passphrase|decrypt|authentication/.test(s))
    return 'The passphrase is incorrect, or the encrypted workspace is damaged. No data was deleted.';
  if(/quota|disk full|storage full/.test(s))
    return 'Encrypted workspace storage is full. Free space and retry; previous data was preserved.';
  if(/legacy workspace could not be read/.test(s))
    return 'The previous workspace could not be read. It was not deleted.';
  if(/crypto|secure context|subtle/.test(s))
    return 'Web Crypto is unavailable. Update the Windows WebView2 runtime and retry.';
  return 'Could not unlock the encrypted workspace. Data was preserved; check storage permissions.';
}
export class SecureWorkspace {
  private pending:Promise<void>=Promise.resolve();
  private constructor(private readonly key:CryptoKey,private readonly salt:Uint8Array){}
  static async unlock(passphrase:string):Promise<{vault:SecureWorkspace;workspace:Workspace;migrated:boolean}> {
    if(passphrase.length<12)throw new Error('Use a passphrase of at least 12 characters.');
    if(!crypto?.subtle)throw new Error('Web Crypto is unavailable in this secure context.');
    const existing=localStorage.getItem(STORAGE_KEY);
    const hadLegacy=hasLegacyWorkspace();
    if(existing!==null){
      const e=parseEnvelope(existing);
      const salt=fromBase64(e.salt);
      const key=await derive(passphrase,salt);
      const workspace=await decrypt(key,e);
      // Only remove legacy plaintext after authenticating the encrypted record.
      if(hadLegacy)removeLegacyWorkspace();
      return {vault:new SecureWorkspace(key,salt),workspace,migrated:false};
    }
    const legacy=loadWorkspace();
    if(hadLegacy&&legacy.warning)throw new Error('Legacy workspace could not be read.');
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const key=await derive(passphrase,salt);
    const vault=new SecureWorkspace(key,salt);
    await vault.save(legacy.workspace);
    const persisted=localStorage.getItem(STORAGE_KEY);
    if(!persisted)throw new Error('Encrypted workspace verification failed.');
    const verified=await decrypt(key,parseEnvelope(persisted));
    if(JSON.stringify(verified)!==JSON.stringify(legacy.workspace))
      throw new Error('Encrypted workspace verification failed.');
    if(hadLegacy)removeLegacyWorkspace();
    return {vault,workspace:verified,migrated:hadLegacy};
  }
  save(workspace:Workspace):Promise<void>{
    const data=new TextEncoder().encode(JSON.stringify(workspace));
    const operation=this.pending.catch(()=>undefined).then(async()=>{
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const ciphertext=new Uint8Array(await crypto.subtle.encrypt(
        {name:'AES-GCM',iv:iv as BufferSource},this.key,data as BufferSource));
      const record:Envelope={version:2,iterations:ITERATIONS,
        salt:toBase64(this.salt),iv:toBase64(iv),ciphertext:toBase64(ciphertext)};
      const serialized=JSON.stringify(record);
      localStorage.setItem(STORAGE_KEY,serialized);
      if(localStorage.getItem(STORAGE_KEY)!==serialized)
        throw new Error('Encrypted workspace verification failed.');
    });
    this.pending=operation;
    return operation;
  }
  flush():Promise<void>{return this.pending;}
}
