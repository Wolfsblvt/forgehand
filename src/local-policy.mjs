import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { loadPolicy } from './runner.mjs';
import { effectiveConfiguration } from './config.mjs';

/** Explicit local preview only. Never load proposed local files into a privileged GitHub run. */
export async function localPolicy(path, root = process.cwd()) {
  const actualRoot = await realpath(root);
  const file = async name => {
    if (typeof name !== 'string' || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('Policy path must stay under the explicit repository root');
    const actual = await realpath(resolve(actualRoot, name));
    if (!actual.startsWith(actualRoot + sep)) throw new Error('Policy file resolves outside the explicit repository root');
    return readFile(actual, 'utf8');
  };
  const p = await loadPolicy({ get: async () => ({ default_branch: 'local-preview' }), ref: async () => 'local-preview', file }, path);
  return { ...effectiveConfiguration(p.raw), mode: 'local-preview', root: actualRoot };
}
