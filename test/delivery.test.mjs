import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { install, adoptionFiles } from '../tools/install.mjs';
import { build } from '../tools/build.mjs';
import { localPolicy } from '../src/local-policy.mjs';
import { labelPolicy } from '../src/label-policy.mjs';
const pin='a'.repeat(40);
const release={schemaVersion:1,repository:'Wolfsblvt/forgehand',runtimeRef:pin,releaseUrl:'https://github.com/Wolfsblvt/forgehand/releases/tag/v0.1.0'};
async function scratch(t) { const path=await mkdtemp(join(tmpdir(),'forgehand-'));t.after(()=>rm(path,{recursive:true,force:true}));return path; }

test('adoption packet pins both called workflow and runtime checkout to one exact coordinate',async()=>{
  const files=await adoptionFiles({runtimeRelease:release});
  const workflow=files['.github/workflows/repository-automation.yml'];
  assert.equal(workflow.split(pin).length-1,2);
  assert.ok(!workflow.includes('@@'));
  assert.match(workflow,/FORGEHAND_ENABLED/);
});
test('a bare runtime SHA stays an explicitly non-deployable preview',async t=>{
  const output=await scratch(t);
  const preview=await install({runtimeRef:pin},{output});
  assert.equal(preview.readiness,'public-runtime-unresolved');assert.deepEqual(preview.changes,[]);
  await assert.rejects(install({runtimeRef:pin},{output,write:true}),/public runtime release record/);
  await assert.rejects(adoptionFiles({runtimeRelease:{...release,runtimeRef:'v1'}}),/runtimeRef SHA/);
});
test('adoption is create-only, idempotent and does not overwrite local policy',async t=>{
  const output=await scratch(t),opts={runtimeRelease:release};
  assert.ok((await install(opts,{output})).changes.every(x=>x.state==='create'));
  await install(opts,{output,write:true});
  assert.ok((await install(opts,{output,write:true})).changes.every(x=>x.state==='unchanged'));
  const policy=join(output,'.github/automation/policy.json');await writeFile(policy,'{"profile":"company"}\n');
  await assert.rejects(install(opts,{output,write:true}),/Local content differs/);
  assert.equal(await readFile(policy,'utf8'),'{"profile":"company"}\n');
});
test('generated packet reaches a full offline configuration including canonical label mapping',async t=>{
  const root=await scratch(t);await install({runtimeRelease:release},{output:root,write:true});
  const result=await localPolicy('.github/automation/policy.json',root);
  assert.equal(result.mode,'local-preview');assert.equal(result.config.inactivity.warningDays,7);
  assert.equal(result.config.labels['state.awaiting-release'],'⏳ Awaiting Release');
  assert.equal(result.config.inactivity.prs,false);
});
test('offline preview renders a whole repository message file without executable evaluation',async t=>{
  const root=await scratch(t);
  await writeFile(join(root,'reply.md'),'Local flavor. {{kind}} remains text.\n');
  await writeFile(join(root,'policy.json'),JSON.stringify({messages:{staleWarning:{file:'reply.md'}}}));
  assert.equal((await localPolicy('policy.json',root)).config.messages.staleWarning,'Local flavor. {{kind}} remains text.\n');
});
test('offline preview rejects a template symlink outside its explicit root',async t=>{
  const parent=await scratch(t),root=join(parent,'repo');await mkdir(root);
  await writeFile(join(parent,'private.md'),'not public');
  await symlink(join(parent,'private.md'),join(root,'reply.md'));
  await writeFile(join(root,'policy.json'),JSON.stringify({messages:{staleWarning:{file:'reply.md'}}}));
  await assert.rejects(localPolicy('policy.json',root),/outside/);
});
test('public export is a closed file set with content hashes and supports repeat builds',async t=>{
  const output=join(await scratch(t),'package');const first=await build(output),second=await build(output);
  assert.deepEqual(first.files,second.files);assert.ok(first.files.length>30);
  for(const entry of first.files){
    const bytes=await readFile(join(output,entry.path));assert.equal(bytes.length,entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    assert.ok(!entry.path.includes('node_modules/')&&!entry.path.includes('artifacts/'));
  }
  const manifest=JSON.parse(await readFile(join(output,'MANIFEST.json'),'utf8'));
  assert.deepEqual(manifest.files,first.files);
});
test('public export refuses an unknown file rather than silently carrying it into publication',async t=>{
  const output=await scratch(t);await writeFile(join(output,'private-owner-note.txt'),'retained');
  await assert.rejects(build(output),/outside this export/);
  assert.equal(await readFile(join(output,'private-owner-note.txt'),'utf8'),'retained');
});
test('public export refuses an overlapping source output',async()=>{
  await assert.rejects(build(fileURLToPath(new URL('../src',import.meta.url))),/overlap/);
});
const definition={key:'state.awaiting-release',name:'⏳ Awaiting Release',color:'0E8A7A',description:'[ISSUE] Implemented on next; awaiting stable main source integration.',appliesTo:['issue'],owner:{issue:'automaton'}};
for(const [name,change,pattern] of [
 ['PR-only awaiting-release',{appliesTo:['pr'],description:'[PR] Not allowed.',owner:{pr:'automaton'}},/Issue-only/],
 ['contradictory ownership',{owner:{issue:'both'}},/ownership/],
 ['description scope mismatch',{description:'[PR] Wrong scope.'},/scope/],
 ['non-hex color',{color:'purple'},/color/],
]) test(`canonical label validator rejects ${name}`,()=>assert.throws(()=>labelPolicy({schemaVersion:1,labels:[{...definition,...change}]}),pattern));
test('canonical label validator preserves separate Issue applicability and writer metadata',()=>{
  const policy=labelPolicy({schemaVersion:1,labels:[definition]});
  assert.deepEqual(policy.scopes['state.awaiting-release'],['issue']);
});
