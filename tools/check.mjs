import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { configure } from '../src/config.mjs';
import { labelPolicy } from '../src/label-policy.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const folder of ['src', 'tools', 'test']) {
  for (const name of await readdir(resolve(root, folder))) {
    if (!name.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', resolve(root, folder, name)], { stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(`Syntax check failed: ${folder}/${name}`);
  }
}
const labels = JSON.parse(await readFile(resolve(root, 'examples/label-policy.json'), 'utf8'));
labelPolicy(labels);
const companyLabels = JSON.parse(await readFile(resolve(root, 'examples/company-label-policy.json'), 'utf8'));
labelPolicy(companyLabels);
async function resolveExampleMessages(raw) {
  const resolved = structuredClone(raw);
  const message = async value => value && typeof value === 'object' && typeof value.file === 'string'
    ? readFile(resolve(root, 'examples/messages', basename(value.file)), 'utf8')
    : value;
  for (const [key, value] of Object.entries(resolved.messages ?? {})) resolved.messages[key] = await message(value);
  for (const group of ['replies', 'resolutions']) for (const rule of Object.values(resolved[group] ?? {})) rule.message = await message(rule.message);
  return resolved;
}
for (const name of ['policy.json', 'two-line-policy.json', 'company-policy.json']) {
  const raw = await resolveExampleMessages(JSON.parse(await readFile(resolve(root, 'examples', name), 'utf8')));
  configure({ ...raw, labels: { ...Object.fromEntries(labels.labels.map(x => [x.key, x.name])), ...raw.labels } });
}
configure({
  ...JSON.parse(await readFile(resolve(root, 'examples/company-policy.json'), 'utf8')),
  ownerCards: { enabled: true },
  cleanup: ['owner.attention', 'owner.action-due'],
  labels: { ...Object.fromEntries(companyLabels.labels.map(x => [x.key, x.name])), 'owner.attention': 'Wolf Attention', 'owner.action-due': 'Wolf Action Due' }
});
console.log('Source syntax, selected example policies, and label definitions passed. Hosted workflow behavior is a separate qualification.');
