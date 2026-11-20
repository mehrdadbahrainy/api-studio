import { Collection, Environment, Folder, KeyValue, RequestDraft, Workspace, freshRequest, makeId, row } from './models';
import { ensureFolderPath } from './folder-utils';
import { parseWorkspace } from './workspace-utils';

type Source = Record<string, unknown>;
export interface ImportResult {
  kind: 'native' | 'postman-collection' | 'postman-environment';
  workspace: Workspace;
  importedRequests: number;
  importedCollections: number;
  warnings: string[];
  firstRequestId: string | null;
}
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const MAX_COLLECTIONS = 150;
const MAX_REQUESTS = 2000;
const MAX_ENVIRONMENTS = 80;
const MAX_ROWS = 200;

function object(value: unknown): Source {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Source : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function rows(value:unknown):unknown[] {
  const result=array(value);
  if(result.length>MAX_ROWS)throw new Error('Import contains too many rows (200 row limit). Existing data was not changed.');
  return result;
}
function str(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}
function entries(value: unknown): KeyValue[] {
  return rows(value).map(value => {
    const entry = object(value);
    return { ...row(str(entry.key), str(entry.value)), enabled: entry.disabled !== true && entry.enabled !== false };
  }).filter(entry => !!entry.key);
}
function authParam(auth: Source, type: string, name: string): string {
  const found = array(auth[type]).map(object).find(entry => entry.key === name);
  return str(found?.value);
}
function makeUrl(source: unknown): { url: string; params: KeyValue[] } {
  if (typeof source === 'string') return { url: source, params: [] };
  const value = object(source);
  let url = str(value.raw);
  if (!url) {
    const host = Array.isArray(value.host) ? value.host.map(str).join('.') : str(value.host);
    const path = Array.isArray(value.path) ? value.path.map(str).join('/') : str(value.path);
    const protocol = str(value.protocol);
    const port = str(value.port);
    url = (protocol ? protocol + '://' : '') + host + (port ? ':' + port : '') +
      (path ? '/' + path.replace(/^\/+/, '') : '');
  }
  const params = entries(value.query);
  // Postman stores query values twice: in raw and query[]. Do not send them twice.
  if (Array.isArray(value.query)) url = url.split('?')[0].split('#')[0];
  return { url, params };
}
function encodeFormValue(value: string): string {
  // Preserve Postman variables for API Studio interpolation before URL encoding on send.
  return encodeURIComponent(value).replace(/%7B%7B/gi, '{{').replace(/%7D%7D/gi, '}}');
}
function applyAuth(draft: RequestDraft, raw: unknown, warnings: Set<string>): void {
  const auth = object(raw), type = str(auth.type);
  if (!type || type === 'noauth') return;
  if (type === 'bearer') {
    draft.authMode = 'bearer';
    draft.bearerToken = authParam(auth, type, 'token');
  } else if (type === 'basic') {
    draft.authMode = 'basic';
    draft.basicUsername = authParam(auth, type, 'username');
    draft.basicPassword = authParam(auth, type, 'password');
  } else if (type === 'apikey') {
    const name = authParam(auth, type, 'key');
    const value = authParam(auth, type, 'value');
    const location = authParam(auth, type, 'in');
    if (name) (location === 'query' ? draft.params : draft.headers).push(row(name, value));
    else warnings.add('Some API key auth settings did not have a key name and were not imported.');
  } else {
    warnings.add('Unsupported Postman auth types (such as OAuth 2.0) require manual setup after import.');
  }
}
function makeRequest(item: Source, inheritedAuth: unknown, warnings: Set<string>): RequestDraft | null {
  const raw = item.request;
  const request = typeof raw === 'string' ? { method: 'GET', url: raw } : object(raw);
  const method = str(request.method).toUpperCase() || 'GET';
  if (!METHODS.has(method)) {
    warnings.add('Requests using unsupported HTTP methods were skipped.');
    return null;
  }
  const draft = freshRequest();
  draft.id = makeId();
  draft.name = str(item.name) || 'Untitled request';
  draft.method = method as RequestDraft['method'];
  const parsedUrl = makeUrl(request.url);
  draft.url = parsedUrl.url;
  draft.params = parsedUrl.params;
  draft.headers = entries(request.header);
  draft.formData = [];
  draft.bodyMode = 'none';
  draft.body = '';
  draft.authMode = 'none';
  draft.bearerToken = '';
  draft.basicUsername = '';
  draft.basicPassword = '';

  applyAuth(draft, request.auth === null || request.auth === undefined ? inheritedAuth : request.auth, warnings);
  const body = object(request.body);
  const mode = str(body.mode);
  if (mode === 'raw') {
    const language = str(object(object(body.options).raw).language).toLowerCase();
    const jsonHeader = draft.headers.some(h => h.key.toLowerCase() === 'content-type' && /[/+]json\b/i.test(h.value));
    draft.bodyMode = language === 'json' || jsonHeader ? 'json' : 'text';
    draft.body = str(body.raw);
    if (language === 'graphql') warnings.add('GraphQL bodies are imported as plain text and may need manual editing.');
  } else if (mode === 'urlencoded') {
    draft.bodyMode = 'urlencoded';
    draft.body = entries(body.urlencoded).filter(x => x.enabled)
      .map(x => encodeFormValue(x.key) + '=' + encodeFormValue(x.value)).join('&');
    if (array(body.urlencoded).some(x => object(x).disabled === true))
      warnings.add('Disabled urlencoded fields are excluded from imported request bodies.');
  } else if (mode === 'formdata') {
    draft.bodyMode = 'formdata';
    const fields = array(body.formdata);
    draft.formData = entries(fields.filter(value => str(object(value).type) !== 'file'));
    if (fields.some(x => str(object(x).type) === 'file'))
      warnings.add('Postman file-upload fields cannot be imported; attach files manually in another client.');
  } else if (mode && mode !== 'none') {
    warnings.add('Unsupported Postman body modes were omitted and must be configured manually.');
  }
  if (array(item.event).length) warnings.add('Postman pre-request and test scripts are not imported or executed.');
  return draft;
}
function postmanVariables(raw: unknown): KeyValue[] {
  return rows(raw).map(value => {
    const entry = object(value);
    return { ...row(str(entry.key), str(entry.value)), enabled: entry.disabled !== true && entry.enabled !== false };
  }).filter(x => x.key.trim() !== '');
}
function verifyCapacity(workspace: Workspace, addedCollections: number, addedRequests: number, addedEnvironments: number): void {
  const requests = workspace.collections.reduce((total, c) => total + c.requests.length, 0);
  if (workspace.collections.length + addedCollections > MAX_COLLECTIONS ||
      requests + addedRequests > MAX_REQUESTS ||
      workspace.environments.length + addedEnvironments > MAX_ENVIRONMENTS)
    throw new Error('Import exceeds API Studio workspace limits (150 collections, 2,000 requests, 80 environments). Existing data was not changed.');
}
function importCollection(raw: Source, workspace: Workspace): ImportResult {
  const info = object(raw.info);
  const schema = str(info.schema);
  if (schema && !/\/collection\/v2\.[01]\./i.test(schema))
    throw new Error('Only Postman Collection v2.0 and v2.1 JSON exports are supported.');
  const name = str(info.name).trim() || 'Postman collection';
  const groups: Collection[] = [];
  const newFolders:Folder[]=[];
  const byPath = new Map<string, Collection>();
  const warnings = new Set<string>();
  let count = 0;
  let firstRequestId: string | null = null;
  const getGroup = (path: string[]): Collection => {
    const key = path.join(' / ') || name;
    let found = byPath.get(key);
    if (!found) {
      const plan=ensureFolderPath([...(workspace.folders??[]),...newFolders],path.slice(0,-1));
      newFolders.splice(0,newFolders.length,...plan.folders.slice((workspace.folders??[]).length));
      found = { id: makeId(), name: key, requests: [],...(plan.id?{folderId:plan.id}:{}) };
      byPath.set(key, found);
      groups.push(found);
    }
    return found;
  };
  const walk = (items: unknown[], folder: string[], auth: unknown, depth: number): void => {
    if (depth > 20) throw new Error('Postman folder nesting is too deep. No data was imported.');
    for (const rawItem of items) {
      const item = object(rawItem);
      if (Array.isArray(item.item)) {
        const nextName = str(item.name).trim() || 'Unnamed folder';
        const next = [...folder, nextName];
        if (!item.item.length) getGroup(next);
        if (array(item.event).length) warnings.add('Postman pre-request and test scripts are not imported or executed.');
        walk(item.item, next, item.auth == null ? auth : item.auth, depth + 1);
      } else if (item.request !== undefined) {
        const request = makeRequest(item, auth, warnings);
        if (!request) continue;
        const group = getGroup(folder);
        request.collectionId = group.id;
        group.requests.push(request);
        count++;
        if (!firstRequestId) firstRequestId = request.id;
      }
    }
  };
  if (array(raw.event).length) warnings.add('Postman pre-request and test scripts are not imported or executed.');
  walk(array(raw.item), [name], raw.auth, 0);
  const vars = postmanVariables(raw.variable);
  const env: Environment | null = vars.length ? { id: makeId(), name: name + ' variables', variables: vars } : null;
  verifyCapacity(workspace, groups.length, count, env ? 1 : 0);
  if (!groups.length && !env) throw new Error('No supported Postman requests or variables were found.');
  const next: Workspace = {
    ...workspace,
    collections: [...workspace.collections, ...groups],
    folders:[...(workspace.folders??[]),...newFolders],
    environments: env ? [...workspace.environments, env] : workspace.environments,
    selectedEnvironmentId: env ? env.id : workspace.selectedEnvironmentId
  };
  if (raw.auth && object(raw.auth).type && !['noauth', 'bearer', 'basic', 'apikey'].includes(str(object(raw.auth).type)))
    warnings.add('Unsupported Postman collection auth requires manual setup.');
  return { kind: 'postman-collection', workspace: next, importedRequests: count,
    importedCollections: groups.length, warnings: [...warnings], firstRequestId };
}
function importEnvironment(raw: Source, workspace: Workspace): ImportResult {
  const vars = postmanVariables(raw.values);
  if (!vars.length) throw new Error('Postman environment contains no variables to import.');
  verifyCapacity(workspace, 0, 0, 1);
  const env: Environment = { id: makeId(), name: str(raw.name) || 'Postman environment', variables: vars };
  return { kind: 'postman-environment', workspace: { ...workspace, environments: [...workspace.environments, env],
    selectedEnvironmentId: env.id }, importedRequests: 0, importedCollections: 0, warnings: [], firstRequestId: null };
}
/** Detect known JSON formats. Never execute imported requests, scripts or arbitrary code. */
export function parseImportedJson(raw: unknown, current: Workspace): ImportResult {
  const input = object(raw);
  if (input.version === 1) {
    const workspace = parseWorkspace(raw);
    return { kind: 'native', workspace, importedRequests: workspace.collections.reduce((n, c) => n + c.requests.length, 0),
      importedCollections: workspace.collections.length, warnings: [], firstRequestId: workspace.collections.flatMap(c => c.requests)[0]?.id ?? null };
  }
  if (Array.isArray(input.item) && Object.keys(object(input.info)).length){
    const result=importCollection(input,current);
    parseWorkspace(result.workspace);
    return result;
  }
  if (Array.isArray(input.values) && (input._postman_variable_scope === 'environment' || typeof input.name === 'string')){
    const result=importEnvironment(input,current);
    parseWorkspace(result.workspace);
    return result;
  }
  throw new Error('Unrecognized JSON format. Import an API Studio workspace, Postman Collection v2.0/v2.1, or Postman environment export.');
}
