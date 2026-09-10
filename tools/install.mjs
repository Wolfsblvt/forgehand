import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url));

/**
 * A release record binds generation to the public runtime result selected at publication.
 * It is intentionally not an online availability check: callers supply the reviewed public
 * release result, and this installer proves only that every generated coordinate matches it.
 */
export function publicRuntime(release) {
  if (!release || typeof release !== 'object' || Array.isArray(release) || release.schemaVersion !== 1) throw new Error('Supply a public runtime release record with schemaVersion 1');
  const { repository, runtimeRef, releaseUrl } = release;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Public runtime release record has an invalid repository');
  if (!/^[a-f0-9]{40}$/.test(runtimeRef ?? '')) throw new Error('Public runtime release record needs an exact runtimeRef SHA');
  let releaseCoordinate;
  try { releaseCoordinate = new URL(releaseUrl); } catch { throw new Error('Public runtime release record needs its authoritative GitHub release URL'); }
  if (releaseCoordinate.origin !== 'https://github.com' || !releaseCoordinate.pathname.startsWith(`/${repository}/releases/`)) throw new Error('Public runtime release record needs its authoritative GitHub release URL');
  return { repository, runtimeRef, releaseUrl };
}

/** Create-only adoption assets. A runtime update never rewrites local policy or branded messages. */
export async function adoptionFiles({ runtimeRelease }) {
  const { repository: runtimeRepository, runtimeRef } = publicRuntime(runtimeRelease);
  const template = await readFile(resolve(root, 'examples/repository-automation.yml'), 'utf8');
  const files = {
    '.github/workflows/repository-automation.yml': template.replaceAll('@@RUNTIME_REPOSITORY@@', runtimeRepository).replaceAll('@@RUNTIME_SHA@@', runtimeRef),
    '.github/automation/policy.json': await readFile(resolve(root, 'examples/policy.json'), 'utf8'),
    '.github/label-policy.json': await readFile(resolve(root, 'examples/label-policy.json'), 'utf8'),
  };
  const workflow = files['.github/workflows/repository-automation.yml'];
  if (!workflow.includes(`${runtimeRepository}/.github/workflows/automation.yml@${runtimeRef}`) || !workflow.includes(`runtime-repository: ${runtimeRepository}`) || !workflow.includes(`runtime-ref: ${runtimeRef}`)) throw new Error('Generated caller did not preserve the selected public runtime coordinates');
  return files;
}

export async function install(options, { write = false, output = resolve(root, 'artifacts/adoption') } = {}) {
  if (!options.runtimeRelease) {
    if (write) throw new Error('Cannot create an activatable caller without a public runtime release record');
    return { mode: 'preview', readiness: 'public-runtime-unresolved', output, changes: [], next: 'Supply --runtime-release <authoritative-public-release-record.json> after publication.' };
  }
  const files = await adoptionFiles(options), changes = [];
  for (const [name, content] of Object.entries(files)) {
    let existing;
    try { existing = await readFile(resolve(output, name), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    changes.push({ path: name, state: existing === undefined ? 'create' : existing === content ? 'unchanged' : 'different-local-content' });
  }
  if (write && changes.some(x => x.state === 'different-local-content')) throw new Error('Local content differs; review the proposed pin and preserve local policy/messages instead of overwriting');
  if (write) for (const change of changes.filter(x => x.state === 'create')) {
    const target = resolve(output, change.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, files[change.path], { encoding: 'utf8', flag: 'wx' });
  }
  return { mode: write ? 'create-only' : 'preview', readiness: 'public-runtime-bound', runtime: publicRuntime(options.runtimeRelease), output, changes };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values } = parseArgs({ options: { 'runtime-release': { type: 'string' }, 'runtime-ref': { type: 'string' }, output: { type: 'string' }, write: { type: 'boolean', default: false } } });
    const runtimeRelease = values['runtime-release'] ? JSON.parse(await readFile(resolve(values['runtime-release']), 'utf8')) : undefined;
    console.log(JSON.stringify(await install({ runtimeRelease, runtimeRef: values['runtime-ref'] }, { write: values.write, output: values.output }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
