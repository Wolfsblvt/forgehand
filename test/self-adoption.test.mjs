import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { adoptionFiles, install, publicRuntime } from '../tools/install.mjs';
import { localPolicy } from '../src/local-policy.mjs';
import { render } from '../src/text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('self-adoption source pins the published runtime twice and leaves the caller disabled', async () => {
  const release = JSON.parse(await file('.github/automation/runtime-release.json'));
  const selected = publicRuntime(release);
  assert.equal(selected.repository, 'Wolfsblvt/forgehand');
  assert.equal(selected.runtimeRef, 'f43b38f3599c099799d21f9db0065213536a13a3');
  assert.equal(selected.releaseUrl, 'https://github.com/Wolfsblvt/forgehand/releases/tag/v0.2.0');
  const generated = await adoptionFiles({ runtimeRelease: release });
  const caller = await file('.github/workflows/repository-automation.yml');
  assert.equal(caller, generated['.github/workflows/repository-automation.yml']);
  assert.equal(caller.split(selected.runtimeRef).length - 1, 2);
  assert.match(caller, /if: vars\.FORGEHAND_ENABLED == 'true'/);
  assert.match(caller, /apply: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| inputs\.apply \}\}/);
  assert.doesNotMatch(caller, /issues: write|pull-requests: write/);
  assert.equal(await file('.diffdevil.yml'), generated['.diffdevil.yml']);
  for (const name of Object.keys(generated).filter(path => path.startsWith('.github/automation/messages/'))) {
    assert.equal(await file(name), generated[name]);
  }
  const first = await install({ runtimeRelease: release }, { output: root });
  const second = await install({ runtimeRelease: release }, { output: root });
  assert.deepEqual(first.changes, second.changes);
  assert.ok(first.changes.every(change => ['unchanged', 'different-local-content'].includes(change.state)));
  assert.ok(first.changes.some(change => change.path === '.github/automation/policy.json' && change.state === 'unchanged'));
  assert.ok(first.changes.some(change => change.path === '.github/label-policy.json' && change.state === 'different-local-content'));
});

test('self-adoption policy validates and renders every selected message without a live writer', async () => {
  const { config, mode } = await localPolicy('.github/automation/policy.json', root);
  assert.equal(mode, 'local-preview');
  assert.equal(config.profile, 'product');
  assert.deepEqual(config.inactivity, { issues: true, prs: true, afterDays: 90, warningDays: 7 });
  assert.deepEqual(config.response, { enabled: true, afterDays: 14, warningDays: 7 });
  assert.equal(config.branches.next, null);
  assert.equal(config.ownerCards.enabled, false);
  assert.equal(config.gate.enabled, false);
  assert.deepEqual(config.areas.map(area => area.key), ['area.runtime', 'area.adoption', 'area.docs']);
  const values = {
    kind: 'issue', number: 7, phrase: 'still relevant', afterDays: 90,
    warningDays: 7, deadline: '2026-10-01', keepOpenLabel: 'Keep Open',
    receiver: 'reporter', requestUrl: 'https://github.com/Wolfsblvt/forgehand/issues/7#issuecomment-1',
    reference: 'https://github.com/Wolfsblvt/forgehand/issues/8', main: 'main',
    branch: 'next', prUrl: 'https://github.com/Wolfsblvt/forgehand/pull/9',
    commitSha: 'a'.repeat(40), tryNextUrl: 'https://example.org/next'
  };
  const templates = [
    ...Object.values(config.messages),
    ...Object.values(config.replies).map(rule => rule.message),
    ...Object.values(config.resolutions).map(rule => rule.message),
    await file('.github/automation/messages/diffdevil-xl.md')
  ];
  assert.equal(templates.length, 19);
  for (const template of templates) {
    const rendered = render(template, values);
    assert.ok(rendered.trim());
    assert.doesNotMatch(rendered, /\{\{/);
  }
});
