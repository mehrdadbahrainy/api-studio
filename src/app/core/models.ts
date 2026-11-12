export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type BodyMode = 'none' | 'json' | 'text' | 'urlencoded' | 'formdata';
export type AuthMode = 'none' | 'bearer' | 'basic';
export type EditorTab = 'params' | 'headers' | 'body' | 'auth';
export type ResponseTab = 'body' | 'headers';

export interface KeyValue { id: string; enabled: boolean; key: string; value: string; }
export interface RequestDraft {
  id: string;
  collectionId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyMode: BodyMode;
  body: string;
  formData: KeyValue[];
  authMode: AuthMode;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
}
export interface Collection { id: string; name: string; requests: RequestDraft[]; }
export interface Environment { id: string; name: string; variables: KeyValue[]; }
export interface HistoryEntry { id: string; at: string; request: RequestDraft; status: number | null; durationMs: number | null; }
export interface Workspace { version: 1; collections: Collection[]; environments: Environment[]; selectedEnvironmentId: string | null; history: HistoryEntry[]; }
export interface HttpResult {
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: KeyValue[];
  body: string;
  contentType: string;
  binary: boolean;
}
export function makeId(): string { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function row(key = '', value = ''): KeyValue { return { id: makeId(), enabled: true, key, value }; }
export function freshRequest(): RequestDraft {
  return { id: makeId(), collectionId: null, name: 'Untitled request', method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1', params: [row()], headers: [row('Accept', 'application/json')], bodyMode: 'none', body: '{\n  "name": "example"\n}', formData:[row()], authMode: 'none', bearerToken: '', basicUsername: '', basicPassword: '' };
}
export function initialWorkspace(): Workspace {
  const sample = freshRequest(); sample.name = 'Get a sample TODO';
  const collection: Collection = { id: makeId(), name: 'Getting started', requests: [] };
  sample.collectionId = collection.id; collection.requests.push(sample);
  return { version: 1, collections: [collection], environments: [{ id: makeId(), name: 'Local development', variables: [row('baseUrl', 'http://localhost:3000'), row('token', '')] }], selectedEnvironmentId: null, history: [] };
}
export function copyRequest(request: RequestDraft): RequestDraft {
  return { ...request, params: request.params.map(x=>({...x})), headers: request.headers.map(x=>({...x})), formData: request.formData.map(x=>({...x})) };
}
