const labels = {
  'state.stale': '⏳ Stale', 'state.awaiting-response': '⏳ Awaiting Response',
  'state.awaiting-release': '⏳ Awaiting Release', 'needs.triage': '🧭 Needs Triage',
  'control.keep-open': '🛠️ Keep Open', 'control.manual-triage': '🛠️ Manual Triage',
  'control.no-auto-reply': '🛠️ No Auto-reply'
};
export const defaults = {
  schemaVersion: 1,
  labelPolicy: null,
  actor: 'wolfsblvt-automaton[bot]',
  automationAccounts: [],
  inactivity: { issues: true, prs: true, afterDays: 90, warningDays: 7 },
  response: { enabled: true, afterDays: 14, warningDays: 7 },
  reopen: { enabled: true, phrase: 'still relevant' },
  ownerCards: { enabled: false },
  branches: { main: 'main', next: null, tryNextUrl: '' },
  labels,
  areas: [],
  intake: { issues: true, prs: false, labels: ['needs.triage'], rules: [] },
  replies: {},
  resolutions: {},
  gate: { enabled: false, checkName: 'Repository policy', protectMain: true, allowedMainLabels: [], blockingLabels: [] },
  cleanup: ['state.stale', 'state.awaiting-response'],
  messages: {},
  profile: 'product'
};
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);

export function merge(base, override) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(override)) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new Error('Unsafe configuration key');
    out[k] = object(out[k]) && object(v) ? merge(out[k], v) : structuredClone(v);
  }
  return out;
}

/** JSON is deliberate: no executable policy, YAML coercion, or install-time dependency. */
export function configure(overrides = {}) {
  if (!object(overrides)) throw new Error('Configuration must be an object');
  for (const k of Object.keys(overrides)) if (!Object.hasOwn(defaults, k)) throw new Error(`Unknown configuration key: ${k}`);
  const c = merge(defaults, overrides);
  if (c.schemaVersion !== 1) throw new Error('Unsupported configuration schemaVersion');
  if (!/^[\w-]+\[bot\]$/.test(c.actor)) throw new Error('actor must be an App bot login');
  for (const group of ['inactivity','response','reopen','ownerCards','branches','gate','intake']) {
    if (!object(c[group])) throw new Error(`${group} must be an object`);
    for (const k of Object.keys(c[group])) if (!Object.hasOwn(defaults[group],k)) throw new Error(`Unknown ${group}.${k}`);
  }
  for (const [o,k] of [['inactivity','issues'],['inactivity','prs'],['response','enabled'],['reopen','enabled'],['ownerCards','enabled'],['gate','enabled'],['gate','protectMain'],['intake','issues'],['intake','prs']]) {
    if (typeof c[o][k] !== 'boolean') throw new Error(`${o}.${k} must be boolean`);
  }
  for (const o of ['inactivity','response']) for (const k of ['afterDays','warningDays']) {
    if (!Number.isFinite(c[o][k]) || c[o][k] <= 0) throw new Error(`${o}.${k} must be positive days`);
  }
  if (!['product','company'].includes(c.profile)) throw new Error('Unknown profile');
  if (c.profile === 'company') {
    if (!Object.hasOwn(overrides.inactivity ?? {},'issues')) c.inactivity.issues = false;
    if (!Object.hasOwn(overrides.inactivity ?? {},'prs')) c.inactivity.prs = false;
  }
  if (typeof c.reopen.phrase !== 'string' || !c.reopen.phrase.trim()) throw new Error('Reopening phrase must not be empty');
  if (typeof c.branches.main !== 'string' || !c.branches.main || (c.branches.next !== null && typeof c.branches.next !== 'string') || c.branches.main === c.branches.next) throw new Error('Distinct stable/development branches required');
  if (c.branches.next && !/^https:\/\//.test(c.branches.tryNextUrl)) throw new Error('Two-line policy needs the actual HTTPS tryNextUrl');
  if (!object(c.labels) || new Set(Object.values(c.labels)).size !== Object.keys(c.labels).length) throw new Error('Label names must be unique');
  for (const [k,v] of Object.entries(c.labels)) if (!k || typeof v !== 'string' || !v.trim()) throw new Error('Invalid label mapping');
  for (const group of ['areas','cleanup','automationAccounts']) if (!Array.isArray(c[group])) throw new Error(`${group} must be an array`);
  if (c.ownerCards.enabled && (!c.labels['owner.attention'] || !c.labels['owner.action-due'])) throw new Error('Owner-card projection needs both owner labels');
  if (c.ownerCards.enabled && !['owner.attention','owner.action-due'].every(key=>c.cleanup.includes(key))) throw new Error('Owner-card projection needs both owner labels in close cleanup');
  const used = new Set();
  for (const a of c.areas) {
    if (!a.key?.startsWith('area.') || !c.labels[a.key] || used.has(a.key)) throw new Error('Area needs a unique mapped area key');
    used.add(a.key);
    if (!Array.isArray(a.include) || !Array.isArray(a.exclude ?? [])) throw new Error('Area patterns must be arrays');
    for (const p of [...a.include,...(a.exclude ?? [])]) glob(p);
  }
  for (const group of ['replies','resolutions','messages']) if (!object(c[group])) throw new Error(`${group} must be an object`);
  for (const value of Object.values(c.messages)) if (typeof value !== 'string') throw new Error('Resolve message file references before validating the effective configuration');
  if (c.labelPolicy !== null && typeof c.labelPolicy !== 'string') throw new Error('labelPolicy must be a repository-relative path');
  const hintKey = k => k === 'needs.triage' || k.startsWith('type.') || k.startsWith('area.') || k.startsWith('platform.');
  if (!Array.isArray(c.intake.labels) || !Array.isArray(c.intake.rules)) throw new Error('Intake labels/rules must be arrays');
  for (const k of c.intake.labels) if (!c.labels[k] || !hintKey(k)) throw new Error(`Invalid intake hint key ${k}`);
  for (const r of c.intake.rules) if (!object(r) || !c.labels[r.key] || !hintKey(r.key) || typeof r.titlePrefix !== 'string' || !r.titlePrefix.trim()) throw new Error('Intake rules need a mapped hint key and literal titlePrefix');
  for (const [k,r] of Object.entries(c.replies)) {
    if (k.startsWith('size.') || !c.labels[k] || !object(r) || typeof r.message !== 'string') throw new Error(`Invalid reply rule ${k}`);
  }
  for (const [k,r] of Object.entries(c.resolutions)) {
    if (k.startsWith('size.') || !c.labels[k] || !object(r) || !['completed','not_planned'].includes(r.reason)) throw new Error(`Invalid resolution ${k}`);
    if (typeof r.message !== 'string') throw new Error(`Resolution ${k} needs a message`);
    if (r.requiresReference !== undefined && typeof r.requiresReference !== 'boolean') throw new Error('Invalid resolution reference rule');
    if (r.lock !== undefined && !['off-topic','too heated','resolved','spam'].includes(r.lock)) throw new Error('Invalid lock reason');
  }
  for (const k of c.cleanup) if (!c.labels[k] || k.startsWith('size.') || k.startsWith('control.')) throw new Error(`Invalid cleanup key ${k}`);
  for (const field of ['allowedMainLabels','blockingLabels']) if (!Array.isArray(c.gate[field]) || c.gate[field].some(k => !c.labels[k])) throw new Error('Unmapped gate label');
  if (typeof c.gate.checkName !== 'string' || !c.gate.checkName.trim()) throw new Error('gate.checkName must be non-empty');
  return c;
}

/** Documented small glob dialect: *, ** and ?. No extglob, braces or negation. */
export function glob(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.startsWith('/') || /[!{}\[\]\\]/.test(pattern) || pattern.split('/').includes('..')) throw new Error(`Unsupported glob: ${pattern}`);
  let r = '^';
  for (let i=0;i<pattern.length;i++) {
    const ch=pattern[i];
    if (ch==='*' && pattern[i+1]==='*') {
      i++;
      if (pattern[i+1]==='/') { i++; r+='(?:.*/)?'; } else r+='.*';
    } else if (ch==='*') r+='[^/]*';
    else if (ch==='?') r+='[^/]';
    else r+=ch.replace(/[.+^$()|]/g,'\\$&');
  }
  return new RegExp(r+'$');
}

export function effectiveConfiguration(overrides) {
  const config = configure(overrides);
  const sources = {};
  function walk(v,o,p='') {
    for (const [k,x] of Object.entries(v)) {
      const at=p?`${p}.${k}`:k;
      if (object(x)) walk(x,o?.[k],at);
      else sources[at]=o && Object.hasOwn(o,k)?'repository':'built-in';
    }
  }
  walk(config,overrides);
  return {config,sources};
}
