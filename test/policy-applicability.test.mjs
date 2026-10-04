import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicy } from '../src/runner.mjs';
import { localPolicy } from '../src/local-policy.mjs';
import { plan } from '../src/planner.mjs';
import { fixture } from './fixture.mjs';

const view = f => ({ ...f.s, replies: [...f.s.comments, ...f.s.replies] });
const policyReader = files => ({
  get: async () => ({ default_branch: 'main' }),
  ref: async () => 'a'.repeat(40),
  file: async path => files[path]
});
const planFor = (f, config) => plan(view(f), config, f.clock.now());

test('null canonical policy preserves native lifecycle controls in runtime and preview', async t => {
  const root = await mkdtemp(join(tmpdir(), 'forgehand-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'policy.json'), JSON.stringify({ labelPolicy: null }));

  const runtime = await loadPolicy(policyReader({ 'policy.json': JSON.stringify({ labelPolicy: null }) }), 'policy.json');
  const preview = await localPolicy('policy.json', root);

  for (const key of ['control.keep-open', 'control.manual-triage', 'control.no-auto-reply']) {
    const f = fixture({ age: 120 });
    f.label(runtime.config.labels[key]);
    assert.deepEqual(planFor(f, runtime.config).filter(effect => effect.purpose === 'staleWarning'), []);
    assert.deepEqual(planFor(f, preview.config), planFor(f, runtime.config));
  }
});

test('canonical object-kind scopes survive runtime loading and local preview', async t => {
  const root = await mkdtemp(join(tmpdir(), 'forgehand-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configuration = { labelPolicy: 'labels.json' };
  const labels = {
    schemaVersion: 1,
    labels: [{
      key: 'control.keep-open',
      name: '🛠️ Keep Open',
      color: '0E8A7A',
      description: '[PR] Pause general inactivity handling for this pull request.',
      appliesTo: ['pr'],
      owner: { pr: 'agent' }
    }]
  };
  const files = { 'policy.json': JSON.stringify(configuration), 'labels.json': JSON.stringify(labels) };
  await writeFile(join(root, 'policy.json'), files['policy.json']);
  await writeFile(join(root, 'labels.json'), files['labels.json']);

  const runtime = await loadPolicy(policyReader(files), 'policy.json');
  const preview = await localPolicy('policy.json', root);
  assert.deepEqual(runtime.config.labelScopes['control.keep-open'], ['pr']);

  const issue = fixture({ age: 120 });
  issue.label(runtime.config.labels['control.keep-open']);
  assert.ok(planFor(issue, runtime.config).some(effect => effect.purpose === 'staleWarning'));
  assert.deepEqual(planFor(issue, preview.config), planFor(issue, runtime.config));

  const pullRequest = fixture({ age: 120, pr: true });
  pullRequest.label(runtime.config.labels['control.keep-open']);
  assert.deepEqual(planFor(pullRequest, runtime.config), []);
  assert.deepEqual(planFor(pullRequest, preview.config), planFor(pullRequest, runtime.config));
});
