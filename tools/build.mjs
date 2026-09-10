import { mkdir, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
const root = fileURLToPath(new URL('../', import.meta.url));
const selected = ['src','tools','examples','schema','docs','test','.github','action.yml','package.json','package-lock.json','README.md','AGENTS.md','LICENSE','.gitattributes','.gitignore'];

/** Export only the public implementation. Unknown output bytes are never silently retained or removed. */
export async function build(output = resolve(root, 'artifacts/package')) {
  output = resolve(output);
  if (output === resolve(root) || selected.some(p => output === resolve(root,p) || output.startsWith(resolve(root,p)+sep))) {
    throw new Error('Build output must not overlap public source');
  }
  async function collect(base, path = '') {
    const absolute = resolve(base,path), state = await lstat(absolute);
    if (state.isSymbolicLink()) throw new Error(`Symlinks do not belong in the public runtime export: ${path}`);
    if (state.isDirectory()) {
      const files=[];
      for (const child of (await readdir(absolute)).sort()) files.push(...await collect(base,path?`${path}/${child}`:child));
      return files;
    }
    if (!state.isFile()) throw new Error(`Non-file export input: ${path}`);
    return [path];
  }
  const files=[];
  for (const path of selected) files.push(...await collect(root,path));
  const allowed=new Set([...files,'MANIFEST.json']);
  let existing=[];
  try { existing=await collect(output); } catch(error) { if(error.code!=='ENOENT') throw error; }
  if(existing.some(path=>!allowed.has(path))) throw new Error('Build output contains files outside this export; select a new output directory');
  const manifest=[];
  for (const path of files.sort()) {
    const target=resolve(output,path),bytes=await readFile(resolve(root,path));
    await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
    manifest.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  await writeFile(resolve(output,'MANIFEST.json'),JSON.stringify({schemaVersion:1,files:manifest},null,2)+'\n');
  return {output,files:manifest};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const {values}=parseArgs({options:{output:{type:'string'}}});
    const result=await build(values.output);
    console.log(`Built ${result.files.length} selected public files under ${relative(process.cwd(),result.output)}; no private checkout or ignored-file sweep.`);
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
