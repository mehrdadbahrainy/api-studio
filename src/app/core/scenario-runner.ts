import { Environment, HttpResult, RequestDraft, Workspace, copyRequest } from './models';
import { prepareRequest, RequestValidationError } from './request-utils';

/**
 * A script-free, transport-agnostic scenario engine.
 * No runtime captures, response bodies, headers or credentials enter its result.
 * The UI supplies the same HTTP sender used by single-request execution.
 */
export type ScenarioAssertion =
  | { kind: 'status-equals'; expected: number }
  | { kind: 'json-equals'; path: string; expected: string | number | boolean | null }
  | { kind: 'json-exists'; path: string }
  | { kind: 'header-contains'; name: string; expected: string }
  | { kind: 'duration-below'; milliseconds: number };

export type ScenarioExtraction =
  | { source: 'json'; path: string; variable: string; secret?: boolean }
  | { source: 'header'; name: string; variable: string; secret?: boolean }
  | { source: 'status'; variable: string; secret?: boolean };

export interface ScenarioStep {
  id: string;
  requestId: string;
  assertions: ScenarioAssertion[];
  extractions: ScenarioExtraction[];
}
export interface ScenarioDefinition {
  id: string;
  name: string;
  steps: ScenarioStep[];
  stopOnFailure: boolean;
}
export type ScenarioStepState = 'passed' | 'failed' | 'cancelled' | 'skipped';
export interface ScenarioStepResult {
  stepId: string;
  state: ScenarioStepState;
  durationMs: number | null;
  checks: { kind: ScenarioAssertion['kind'] | 'default-status'; passed: boolean }[];
  /** Fixed, non-sensitive diagnostic: never includes response/request values. */
  message: string;
}
export interface ScenarioRunResult {
  scenarioId: string;
  steps: ScenarioStepResult[];
  passed: number;
  failed: number;
  skipped: number;
  cancelled: number;
}
export type ScenarioSender = (
  request: RequestDraft,
  environment: Environment | undefined,
  options: { signal?: AbortSignal; timeoutMs: number }
) => Promise<HttpResult>;
export interface ScenarioRunOptions {
  environment?: Environment;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PATH_PATTERN = /^\$(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:0|[1-9]\d{0,3})\])*$/;
const RESERVED_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

export function validateScenario(definition: ScenarioDefinition): void {
  if (!definition || typeof definition !== 'object' || !IDENTIFIER_PATTERN.test(definition.id)) {
    throw new Error('Invalid scenario identifier.');
  }
  if (typeof definition.name !== 'string' || !definition.name.trim() || definition.name.length > 120) {
    throw new Error('Invalid scenario name.');
  }
  if (typeof definition.stopOnFailure !== 'boolean' || !Array.isArray(definition.steps)
    || !definition.steps.length || definition.steps.length > 20) {
    throw new Error('A scenario must contain 1 to 20 ordered steps.');
  }
  const ids = new Set<string>();
  for (const step of definition.steps) {
    if (!step || !IDENTIFIER_PATTERN.test(step.id) || ids.has(step.id)
      || !IDENTIFIER_PATTERN.test(step.requestId)) {
      throw new Error('Invalid or duplicated scenario step identifiers.');
    }
    ids.add(step.id);
    if (!Array.isArray(step.assertions) || step.assertions.length > 12
      || !Array.isArray(step.extractions) || step.extractions.length > 8) {
      throw new Error('A scenario step exceeds its rule limits.');
    }
    for (const rule of step.assertions) {
      if (!rule || typeof rule !== 'object') throw new Error('Invalid scenario assertion.');
      switch (rule.kind) {
        case 'status-equals':
          if (!Number.isInteger(rule.expected) || rule.expected < 100 || rule.expected > 599) {
            throw new Error('Invalid expected HTTP status.');
          }
          break;
        case 'json-equals':
          checkJsonPath(rule.path);
          if (!(rule.expected === null || ['string', 'number', 'boolean'].includes(typeof rule.expected))
            || (typeof rule.expected === 'string' && rule.expected.length > 1000)
            || (typeof rule.expected === 'number' && !Number.isFinite(rule.expected))) {
            throw new Error('Invalid expected JSON value.');
          }
          break;
        case 'json-exists':
          checkJsonPath(rule.path);
          break;
        case 'header-contains':
          checkHeaderName(rule.name);
          if (typeof rule.expected !== 'string' || rule.expected.length > 1000) {
            throw new Error('Invalid expected header value.');
          }
          break;
        case 'duration-below':
          if (!Number.isInteger(rule.milliseconds) || rule.milliseconds < 1 || rule.milliseconds > 600_000) {
            throw new Error('Invalid response duration threshold.');
          }
          break;
        default:
          throw new Error('Unsupported scenario assertion.');
      }
    }
    const variableNames = new Set<string>();
    for (const extraction of step.extractions) {
      if (!extraction || !VARIABLE_PATTERN.test(extraction.variable)
        || RESERVED_NAMES.has(extraction.variable) || variableNames.has(extraction.variable)
        || (extraction.secret !== undefined && typeof extraction.secret !== 'boolean')) {
        throw new Error('Invalid or duplicated extracted variable name.');
      }
      variableNames.add(extraction.variable);
      switch (extraction.source) {
        case 'json': checkJsonPath(extraction.path); break;
        case 'header': checkHeaderName(extraction.name); break;
        case 'status': break;
        default: throw new Error('Unsupported extraction source.');
      }
    }
  }
}

function checkJsonPath(path: string): void {
  if (typeof path !== 'string' || path.length > 150 || !PATH_PATTERN.test(path)
    || path.split('.').length > 21) {
    throw new Error('Invalid restricted JSON path.');
  }
}
function checkHeaderName(name: string): void {
  if (typeof name !== 'string' || !/^[A-Za-z0-9!#$%&'*+.^_\x60|~-]{1,100}$/.test(name)) {
    throw new Error('Invalid header name.');
  }
}
function lookupJsonPath(body: string, path: string): { found: boolean; value: unknown } {
  let current: unknown;
  try { current = JSON.parse(body); }
  catch { return { found: false, value: undefined }; }
  const segments = path.slice(1).match(/\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:0|[1-9]\d{0,3})\]/g) ?? [];
  for (const segment of segments) {
    const key = segment.startsWith('.') ? segment.slice(1) : Number(segment.slice(1, -1));
    if (current === null || typeof current !== 'object'
      || !Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string | number, unknown>)[key];
  }
  return { found: true, value: current };
}
function headerValue(response: HttpResult, name: string): string | undefined {
  return response.headers.find(item => item.key.toLowerCase() === name.toLowerCase())?.value;
}
function assertionPasses(rule: ScenarioAssertion, response: HttpResult): boolean {
  switch (rule.kind) {
    case 'status-equals': return response.status === rule.expected;
    case 'duration-below': return response.durationMs < rule.milliseconds;
    case 'header-contains': return (headerValue(response, rule.name) ?? '').includes(rule.expected);
    case 'json-exists':
      return !response.binary && lookupJsonPath(response.body, rule.path).found;
    case 'json-equals': {
      if (response.binary) return false;
      const match = lookupJsonPath(response.body, rule.path);
      return match.found && match.value === rule.expected;
    }
  }
}
function extractValue(rule: ScenarioExtraction, response: HttpResult): string | undefined {
  let value: unknown;
  switch (rule.source) {
    case 'status': value = response.status; break;
    case 'header': value = headerValue(response, rule.name); break;
    case 'json': {
      if (response.binary) return undefined;
      const match = lookupJsonPath(response.body, rule.path);
      if (!match.found) return undefined;
      value = match.value;
      break;
    }
  }
  if (value === null || value === undefined || typeof value === 'object') return undefined;
  const stringValue = String(value);
  return stringValue.length <= 10_000 ? stringValue : undefined;
}
function environmentWithRuntimeVariables(base: Environment | undefined, captures: Record<string, string>): Environment | undefined {
  const entries = Object.keys(captures).map((key, index) => ({
    id: 'scenario-runtime-' + index, enabled: true, key, value: captures[key]
  }));
  if (!entries.length) return base;
  return {
    id: base?.id ?? 'scenario-runtime',
    name: base?.name ?? 'Scenario runtime',
    variables: [...(base?.variables ?? []).map(item => ({ ...item })), ...entries]
  };
}
function noResult(stepId: string, state: 'skipped' | 'cancelled'): ScenarioStepResult {
  return { stepId, state, durationMs: null, checks: [], message: state === 'skipped'
    ? 'Not executed after an earlier failure or cancellation.' : 'Scenario cancelled.' };
}
/** Execute saved request references only. Runtime values never enter the persisted workspace or result. */
export async function runScenario(
  definition: ScenarioDefinition,
  workspace: Workspace,
  send: ScenarioSender,
  options: ScenarioRunOptions = {}
): Promise<ScenarioRunResult> {
  validateScenario(definition);
  if (!Number.isInteger(options.timeoutMs ?? 30_000) || (options.timeoutMs ?? 30_000) < 1
    || (options.timeoutMs ?? 30_000) > 600_000) throw new Error('Invalid scenario timeout.');
  const saved = new Map(workspace.collections.flatMap(collection =>
    collection.requests.map(request => [request.id, request] as const)));
  const baseEnvironment = options.environment ?? workspace.environments.find(item => item.id === workspace.selectedEnvironmentId);
  const captures: Record<string, string> = Object.create(null);
  const results: ScenarioStepResult[] = [];
  let stop = false;
  for (const step of definition.steps) {
    if (stop) { results.push(noResult(step.id, 'skipped')); continue; }
    if (options.signal?.aborted) {
      results.push(noResult(step.id, 'cancelled'));
      stop = true;
      continue;
    }
    const request = saved.get(step.requestId);
    if (!request) {
      results.push({ stepId: step.id, state: 'failed', durationMs: null, checks: [], message: 'Saved request not found.' });
      if (definition.stopOnFailure) stop = true;
      continue;
    }
    let response: HttpResult;
    try {
      const environment = environmentWithRuntimeVariables(baseEnvironment, captures);
      const draft = copyRequest(request);
      // Fail before network I/O when a dependent variable is unresolved.
      prepareRequest(draft, environment);
      response = await send(draft, environment, { signal: options.signal, timeoutMs: options.timeoutMs ?? 30_000 });
    } catch (error: unknown) {
      if (options.signal?.aborted) {
        results.push(noResult(step.id, 'cancelled'));
        stop = true;
      } else {
        results.push({
          stepId: step.id, state: 'failed', durationMs: null, checks: [],
          message: error instanceof RequestValidationError
            ? 'Required request input or scenario variable is invalid or missing.'
            : 'The request failed. Review the endpoint and retry.'
        });
        if (definition.stopOnFailure) stop = true;
      }
      continue;
    }
    if (options.signal?.aborted) {
      results.push(noResult(step.id, 'cancelled'));
      stop = true;
      continue;
    }
    const checks: ScenarioStepResult['checks'] = step.assertions.map(rule => ({
      kind: rule.kind, passed: assertionPasses(rule, response)
    }));
    if (!step.assertions.some(rule => rule.kind === 'status-equals')) {
      checks.unshift({ kind: 'default-status', passed: response.status >= 200 && response.status < 400 });
    }
    let extractionFailed = false;
    if (checks.every(check => check.passed)) {
      // Do not leak partial captures from a step whose later extraction fails.
      const extracted: Record<string, string> = Object.create(null);
      for (const rule of step.extractions) {
        const value = extractValue(rule, response);
        if (value === undefined) { extractionFailed = true; break; }
        extracted[rule.variable] = value;
      }
      if (!extractionFailed) Object.assign(captures, extracted);
    }
    const passed = checks.every(check => check.passed) && !extractionFailed;
    results.push({
      stepId: step.id, state: passed ? 'passed' : 'failed',
      durationMs: response.durationMs, checks,
      message: passed ? 'Step passed.' : extractionFailed
        ? 'A response value could not be extracted.' : 'A response assertion failed.'
    });
    if (!passed && definition.stopOnFailure) stop = true;
  }
  return {
    scenarioId: definition.id, steps: results,
    passed: results.filter(step => step.state === 'passed').length,
    failed: results.filter(step => step.state === 'failed').length,
    skipped: results.filter(step => step.state === 'skipped').length,
    cancelled: results.filter(step => step.state === 'cancelled').length
  };
}
