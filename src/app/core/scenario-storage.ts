import { ScenarioAssertion, ScenarioDefinition, ScenarioExtraction, validateScenario } from './scenario-runner';

/** Scenario definitions only: never persist run state, response bodies or captured variables. */
export const MAX_SCENARIOS = 100;

function canonicalAssertion(rule: ScenarioAssertion): ScenarioAssertion {
  switch (rule.kind) {
    case 'status-equals': return { kind: 'status-equals', expected: rule.expected };
    case 'json-equals': return { kind: 'json-equals', path: rule.path, expected: rule.expected };
    case 'json-exists': return { kind: 'json-exists', path: rule.path };
    case 'header-contains': return { kind: 'header-contains', name: rule.name, expected: rule.expected };
    case 'duration-below': return { kind: 'duration-below', milliseconds: rule.milliseconds };
  }
}

function canonicalExtraction(rule: ScenarioExtraction): ScenarioExtraction {
  switch (rule.source) {
    case 'json': return { source: 'json', path: rule.path, variable: rule.variable, secret: rule.secret === true };
    case 'header': return { source: 'header', name: rule.name, variable: rule.variable, secret: rule.secret === true };
    case 'status': return { source: 'status', variable: rule.variable, secret: rule.secret === true };
  }
}

/** Parse optional, additive workspace-v1 scenario definitions.
 * Each field is reconstructed from a strict allowlist, so injected/unknown
 * extension keys cannot be written back to the protected workspace or export.
 */
export function parseScenarios(raw: unknown): ScenarioDefinition[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SCENARIOS) {
    throw new Error('Workspace scenarios must be an array of at most 100 definitions.');
  }
  const ids = new Set<string>();
  return raw.map((item: unknown) => {
    validateScenario(item as ScenarioDefinition);
    const original = item as ScenarioDefinition;
    if (ids.has(original.id)) throw new Error('Duplicate scenario identifiers.');
    ids.add(original.id);
    return {
      id: original.id,
      name: original.name.trim(),
      stopOnFailure: original.stopOnFailure,
      steps: original.steps.map(step => ({
        id: step.id, requestId: step.requestId,
        assertions: step.assertions.map(canonicalAssertion),
        extractions: step.extractions.map(canonicalExtraction)
      }))
    };
  });
}
