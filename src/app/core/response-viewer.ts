import { HttpResult } from './models';
export type ResponseMode='raw'|'formatted';
export type ResponseKind='json'|'xml'|'html'|'text'|'binary';
export interface ResponsePreview { kind:ResponseKind; text:string; truncated:boolean; originalBytes:number; }
export const MAX_RESPONSE_PREVIEW_CHARS=500_000;
export function classifyResponse(contentType:string,body:string,binary=false):ResponseKind {
  if(binary)return 'binary';
  const mime=(contentType||'').split(';',1)[0].trim().toLowerCase();
  if(mime.includes('json')||mime.endsWith('+json'))return 'json';
  if(mime.includes('xml')||mime.endsWith('+xml'))return 'xml';
  if(mime==='text/html'||mime==='application/xhtml+xml')return 'html';
  if(mime==='text/plain' || !mime){
    const trimmed=body.trimStart();
    if(trimmed.startsWith('{')||trimmed.startsWith('['))return 'json';
    if(/^<(?:!doctype html|html\b)/i.test(trimmed))return 'html';
    if(trimmed.startsWith('<?xml')||/^<[\w:-]+(?:\s|>|\/)/.test(trimmed))return 'xml';
  }
  return 'text';
}
/** Formats markup as inert text: no HTML is executed, no DOM nodes are created. */
export function formatMarkup(source:string):string {
  const normalized=source.replace(/>\s*</g,'>\n<');
  let indentation=0;
  return normalized.split('\n').map(raw=>{
    const text=raw.trim();
    if(!text)return '';
    if(/^<\/[^>]+>/.test(text))indentation=Math.max(0,indentation-1);
    const prefix='  '.repeat(Math.min(indentation,30));
    if(/^<[^!?/][^>]*>/.test(text)&&!/^<(?:area|base|br|hr|img|input|link|meta|source|wbr)\b/i.test(text)&&!text.startsWith('<!')&&!text.match(/\/>$/)&&!text.match(/^<([^\s>]+)[^>]*>.*<\/\1>$/)){
      indentation++;
    }
    return prefix+text;
  }).filter(Boolean).join('\n');
}
export function responsePreview(response:HttpResult,mode:ResponseMode):ResponsePreview {
  const kind=classifyResponse(response.contentType,response.body,response.binary);
  const truncated=response.body.length>MAX_RESPONSE_PREVIEW_CHARS;
  const raw=truncated?response.body.slice(0,MAX_RESPONSE_PREVIEW_CHARS):response.body;
  let text=raw;
  if(kind==='binary')text='Binary content cannot be previewed as text. Save the response if available.';
  else if(mode==='formatted'&&!truncated){
    if(kind==='json'){try{text=JSON.stringify(JSON.parse(raw),null,2)}catch{text=raw;}}
    if(kind==='xml'||kind==='html')text=formatMarkup(raw);
  }
  return {kind,text,truncated,originalBytes:response.sizeBytes};
}
export function responseFileName(response:HttpResult,at=new Date()):string {
  const kind=classifyResponse(response.contentType,response.body,response.binary);
  const ext=kind==='json'?'json':kind==='xml'?'xml':kind==='html'?'html':'txt';
  const date=at.toISOString().replace(/[:.]/g,'-');
  return 'api-response-'+date+'.'+ext;
}
