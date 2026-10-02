import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adoptionFiles, install, publicRuntime } from '../tools/install.mjs';
import { localPolicy } from '../src/local-policy.mjs';
import { render } from '../src/text.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('self-adoption source pins the published runtime twice and leaves the caller disabled', async () => {
  const release = JSON.parse(await file('.github/automation/runtime-release.json'));
  const selected = publicRuntime(release);
  assert.equal(selected.repository, 'Wolfsblvt/forgehand');
  assert.equal(selected.runtimeRef, 'e02b0ad4176882ea57ed8e23ac2d6ee0eaa6d71a');
  assert.equal(selected.releaseUrl, 'https://github.com/Wolfsblvt/forgehand/releases/tag/v0.2.1');
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

test('diffdevil size policy assigns the repository-owned size labels, not the preset names', async () => {
  for (const [policy, labels] of [['.diffdevil.yml', '.github/label-policy.json'], ['examples/diffdevil.yml', 'examples/label-policy.json']]) {
    const source = await file(policy);
    const block = source.match(/^size:\n  labels:\n((?: {4}\w+: '[^']+'\n)+)/m);
    assert.ok(block, `${policy} maps size@1 onto named labels`);
    const mapped = Object.fromEntries([...block[1].matchAll(/^ {4}(\w+): '([^']+)'$/gm)].map(match => [match[1], match[2]]));
    const owned = JSON.parse(await file(labels)).labels.filter(label => label.key.startsWith('size.'));
    assert.deepEqual(mapped, Object.fromEntries(owned.map(label => [label.key.slice('size.'.length), label.name])));
    assert.doesNotMatch(source, /size\/(XS|S|M|L|XL|Unknown)/);
  }
});

test('interim Action sizing is one disabled Automaton writer reading only trusted base policy', async () => {
  const workflow = await file('.github/workflows/diffdevil.yml');
  assert.match(workflow, /^on:\n {2}pull_request_target:\n/m);
  assert.match(workflow, /^permissions:\n {2}contents: read\n(?! )/m);
  assert.match(workflow, /if: vars\.DIFFDEVIL_ACTION_ENABLED == 'true'/);
  assert.doesNotMatch(workflow, /actions\/checkout/);
  assert.match(workflow, /uses: actions\/create-github-app-token@[0-9a-f]{40} /);
  // With neither input set, the pinned mint Action scopes the token to this repository.
  assert.doesNotMatch(workflow, /^\s+(owner|repositories|enterprise|skip-token-revoke):/m);
  assert.deepEqual([...workflow.matchAll(/^\s+([\w-]+): write$/gm)].map(match => match[1]), ['permission-issues', 'permission-pull-requests']);
  assert.match(workflow, /uses: Wolfsblvt\/diffdevil@[0-9a-f]{40} /);
  assert.match(workflow, /github-token: \$\{\{ steps\.automaton\.outputs\.token \}\}/);
  assert.match(workflow, /policy-token: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /config: \.diffdevil\.yml\n/);
  assert.doesNotMatch(workflow, /policy-source|policy-ref|workspace/);
  assert.match(workflow, /definitions: none/);
  assert.match(workflow, /comment-author: wolfsblvt-automaton\[bot\]\n\s+comment-author-id: '319117825'/);
});

test('DiffDevil cannot run past a failed Automaton identity check', async () => {
  const workflow = await file('.github/workflows/diffdevil.yml');
  const steps = workflow.split(/^ {6}- /m).slice(1);
  assert.equal(steps.length, 3);
  const [mint, guard, writer] = steps;
  assert.match(mint, /^id: automaton\n/);
  assert.match(mint, /uses: actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 /);
  assert.match(guard, /^id: verify-automaton\n/);
  assert.match(guard, /AUTOMATON_APP_SLUG: \$\{\{ steps\.automaton\.outputs\.app-slug \}\}/);
  assert.doesNotMatch(guard, /outputs\.token|github\.token/);
  for (const step of [mint, guard, writer]) {
    // The default success condition must stop the writer after a refused mint or guard.
    assert.doesNotMatch(step, /^\s*(if|continue-on-error):/m);
  }
  assert.match(writer, /uses: Wolfsblvt\/diffdevil@0827485c9d3795ef58a7934cd7a4b8b3fb5cc9c5 /);

  const block = guard.match(/node --input-type=module <<'NODE'\n([\s\S]+?)^ {10}NODE$/m);
  assert.ok(block, 'the inline identity check is available for offline execution');
  const script = block[1].replace(/^ {10}/gm, '');
  let refusal;
  for (const slug of [undefined, '', 'another-app', 'Wolfsblvt-automaton', 'wolfsblvt-automaton ', 'untrusted\n::warning::value']) {
    const env = { ...process.env };
    delete env.AUTOMATON_APP_SLUG;
    if (slug !== undefined) env.AUTOMATON_APP_SLUG = slug;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `${script}\nprocess.stdout.write('write-reached');`], {
      env, encoding: 'utf8', windowsHide: true
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^::error::/);
    refusal ??= result.stderr;
    assert.equal(result.stderr, refusal, 'refusal output never echoes the supplied identity');
  }
  const accepted = spawnSync(process.execPath, ['--input-type=module', '-e', `${script}\nprocess.stdout.write('write-reached');`], {
    env: { ...process.env, AUTOMATON_APP_SLUG: 'wolfsblvt-automaton' }, encoding: 'utf8', windowsHide: true
  });
  assert.ifError(accepted.error);
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stdout, 'write-reached');
  assert.equal(accepted.stderr, '');
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
