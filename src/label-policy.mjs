import { glob } from './config.mjs';

/** Validate the shared mapping; never infer applicability or ownership from emoji/display names. */
export function labelPolicy(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.labels)) throw new Error('Unsupported label-policy schema');
  for (const field of Object.keys(value)) if (!['schemaVersion', 'labels', 'size'].includes(field)) throw new Error(`Unknown label-policy field: ${field}`);
  const names = new Set(), keys = new Set(), mapping = {}, scopes = {}, areas = [];
  for (const label of value.labels) {
    if (!label || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(label.key ?? '') || keys.has(label.key)) throw new Error('Invalid/duplicate label key');
    const currentAndFormer = [label.name, ...(label.previousNames ?? [])];
    if (!Array.isArray(label.previousNames ?? []) || currentAndFormer.some(name => typeof name !== 'string' || !name.trim() || names.has(name))) throw new Error('Invalid/duplicate label name');
    if (!/^[a-f0-9]{6}$/i.test(label.color ?? '')) throw new Error(`Invalid color for ${label.key}`);
    if (typeof label.description !== 'string' || label.description.length > 100) throw new Error(`Invalid description for ${label.key}`);
    if (!Array.isArray(label.appliesTo) || !label.appliesTo.length || new Set(label.appliesTo).size !== label.appliesTo.length || label.appliesTo.some(x => !['issue', 'pr'].includes(x))) throw new Error(`Invalid applicability for ${label.key}`);
    const expected = label.appliesTo.includes('issue') ? (label.appliesTo.includes('pr') ? '[ISSUE][PR]' : '[ISSUE]') : '[PR]';
    if (!label.description.startsWith(expected + ' ')) throw new Error(`Description scope disagrees for ${label.key}`);
    if (!label.owner || label.appliesTo.some(x => !['agent', 'automaton'].includes(label.owner[x])) || Object.keys(label.owner).some(x => !label.appliesTo.includes(x))) throw new Error(`Contradictory ownership for ${label.key}`);
    if (label.key.startsWith('size.') && (label.appliesTo.length !== 1 || label.appliesTo[0] !== 'pr')) throw new Error('Size is PR-only');
    if (label.key === 'state.awaiting-release' && (label.appliesTo.length !== 1 || label.appliesTo[0] !== 'issue')) throw new Error('Awaiting Release is Issue-only');
    keys.add(label.key); currentAndFormer.forEach(name => names.add(name)); mapping[label.key] = label.name; scopes[label.key] = label.appliesTo;
    if (label.key.startsWith('area.') && label.owner.pr === 'automaton') {
      if (!Array.isArray(label.paths?.include) || !Array.isArray(label.paths.exclude ?? [])) throw new Error(`Automatic area ${label.key} needs explicit paths`);
      for (const pattern of [...label.paths.include, ...(label.paths.exclude ?? [])]) glob(pattern);
      areas.push({ key: label.key, include: label.paths.include, exclude: label.paths.exclude ?? [] });
    }
  }
  if (value.size) {
    if (value.size.metric !== 'replacement-lines-v1') throw new Error('Unsupported label measurement contract; qualify the managed diffdevil policy before changing it');
    const limits = ['xs', 's', 'm', 'l'].map(x => value.size.upperExclusive?.[x]);
    if (limits.some((n, i) => !Number.isSafeInteger(n) || n <= 0 || i && n <= limits[i - 1])) throw new Error('Size thresholds must be positive increasing integers');
    for (const field of ['exclude', 'forceInclude', 'includeOnly']) {
      if (!Array.isArray(value.size[field])) throw new Error(`Size ${field} must be an array`);
      for (const rule of value.size[field]) if (typeof rule.glob !== 'string' || !rule.glob || typeof rule.reason !== 'string' || !rule.reason) throw new Error(`Size ${field} needs explicit patterns and reasons`);
    }
  }
  return { mapping, scopes, areas };
}
