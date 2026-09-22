import test from 'node:test';
import assert from 'node:assert/strict';
import { configure,glob,effectiveConfiguration } from '../src/config.mjs';
import { wantsReopen,completionRefs,marker,ownerCardLabels,record,render } from '../src/text.mjs';
import { GitHub } from '../src/github.mjs';
import { fixture,actor,reporter } from './fixture.mjs';

for(const [body,expected] of [
 ['STILL   RELEVANT: reproduced.',true],['This is still\nrelevant.',true],['Still relevance',false],['unstill relevantly',false],
 ['> reply with still relevant',false],['```\nstill relevant\n```',false],['    still relevant',false],['<!-- still relevant -->',false],['`still relevant`',false],
 ['> still relevant\n\nStill relevant: on the latest release.',true]
]) test(`phrase intent: ${JSON.stringify(body)}`,()=>assert.equal(wantsReopen(body),expected));
for(const [body,expected] of [
 ['Fixes #7', [7]],['Closes #7, #8 and #9',[7,8,9]],['Resolves Wolf/project#7',[7]],['Fixes Elsewhere/repo#8',[]],
 ['Related to #7',[]],['> Fixes #7',[]],['```\nFixes #7\n```',[]],['Fixed https://github.com/Wolf/project/issues/7',[7]],
 ['Fixes #7\nCloses #7',[7]],['Fixes #7, and #8',[7,8]]
])test(`completion links: ${JSON.stringify(body)}`,()=>assert.deepEqual(completionRefs(body,'Wolf/project'),expected));
test('a contributor quoting an authentic receipt cannot forge machine state',()=>{
 const body=marker({version:1,id:'test',kind:'timeout'});assert.equal(record({body,user:reporter},actor.login),null);
 assert.equal(record({body,user:actor},actor.login).kind,'timeout');
});
test('multiple, malformed or pre-publication legacy receipts are not accepted',()=>{
 const m=marker({version:1,id:'a',kind:'timeout'});assert.equal(record({body:m+'\n'+m,user:actor},actor.login),null);
 assert.equal(record({body:'<!-- forgehand:v1:invalid -->',user:actor},actor.login),null);
 assert.equal(record({body:m.replace('forgehand:v1','leitsatz-automation:v1'),user:actor},actor.login),null);
});
test('templates are replaceable, nonrecursive data',()=>{
 assert.equal(render('Cute: {{branch}}', {branch:'{{secret}}'}),'Cute: {{secret}}');
 assert.throws(()=>render('{{missing}}',{}),/Unknown/);
});
test('configuration precedence preserves local voice and reports its source',()=>{
 const r=effectiveConfiguration({messages:{staleClosed:'Local brand'},inactivity:{warningDays:12}});
 assert.equal(r.config.inactivity.afterDays,90);assert.equal(r.config.messages.staleClosed,'Local brand');assert.equal(r.sources['inactivity.warningDays'],'repository');assert.equal(r.sources['inactivity.afterDays'],'built-in');
});
test('owner-card projection requires both mapped labels and recognizes no prose substitute',()=>{
  assert.throws(()=>configure({ownerCards:{enabled:true}}),/both owner labels/);
 assert.throws(()=>configure({ownerCards:{enabled:true},labels:{'owner.attention':'Wolf Attention','owner.action-due':'Wolf Action Due'}}),/close cleanup/);
 const c=configure({ownerCards:{enabled:true},cleanup:['owner.attention','owner.action-due'],labels:{'owner.attention':'Wolf Attention','owner.action-due':'Wolf Action Due'}});
 assert.equal(c.ownerCards.enabled,true);assert.deepEqual(ownerCardLabels('Wolf should choose this.'),[]);
});
test('config rejects ambiguous values rather than guessing',()=>{
 assert.throws(()=>configure({schemaVersion:2}),/schemaVersion/);assert.throws(()=>configure({inactivity:{prs:'yes'}}),/boolean/);
 assert.throws(()=>configure({inactivity:{afterDays:0}}),/positive/);assert.throws(()=>configure({unknown:true}),/Unknown/);
 assert.throws(()=>configure({branches:{next:'next'}}),/tryNextUrl/);assert.throws(()=>configure({cleanup:['size.s']}),/cleanup/);
 assert.throws(()=>configure(JSON.parse('{"__proto__":{"polluted":true}}')),/Unknown|Unsafe/);
});
for(const [pattern,path,expected] of [['**/package.json','package.json',true],['**/package.json','a/package.json',true],['src/**','src/a/b',true],['src/*','src/a/b',false],['.github/**','.github/workflows/ci.yml',true],['src/**','Src/x',false]])test(`glob ${pattern} : ${path}`,()=>assert.equal(glob(pattern).test(path),expected));
test('ambiguous glob dialects are rejected',()=>{for(const p of ['!foo','a/{b,c}','a\\b','../file'])assert.throws(()=>glob(p));});
test('GitHub pagination follows all pages, even after a short first page',async()=>{
 const calls=[];const gh=new GitHub({repository:'Wolf/project',fetcher:async url=>{
 calls.push(url);return new Response(JSON.stringify(calls.length===1?[{id:1}]:[{id:2}]),{headers:calls.length===1?{link:'<https://api.github.com/repos/Wolf/project/issues/7/comments?per_page=100&page=2>; rel="next"'}:{}});
 }});assert.deepEqual(await gh.pages('/issues/7/comments'),[{id:1},{id:2}]);assert.equal(calls.length,2);
});
test('pagination cannot export tokens to an attacker origin',async()=>{
 const gh=new GitHub({repository:'Wolf/project',readToken:'fixture-read',fetcher:async()=>new Response('[]',{headers:{link:'<https://evil.invalid/next>; rel="next"'}})});
 await assert.rejects(gh.pages('/issues'),/Untrusted/);
});
test('mutations never fall back to the read-only workflow token',async()=>{
 let called=false;const gh=new GitHub({repository:'Wolf/project',readToken:'fixture-read',fetcher:async()=>{called=true;}});
 await assert.rejects(gh.write('PATCH','/issues/7',{state:'closed'}),/No bounded App writer/);assert.equal(called,false);
});
test('provider errors expose status without echoing credential-containing bodies',async()=>{
 const gh=new GitHub({repository:'Wolf/project',readToken:'fixture-read',fetcher:async()=>new Response('secret contents',{status:403})});
 await assert.rejects(gh.get('/issues/7'),e=>e.status===403&&!e.message.includes('secret contents'));
});
test('Forgehand rejects the retired local diffdevil adapter instead of competing with the managed App',()=>{
  assert.throws(()=>configure({diffdevil:{enabled:true}}),/Unknown configuration key/);
});
test('company defaults leave both Issue and PR inactivity unavailable until selected',()=>{
  const c=configure({profile:'company'});
  assert.equal(c.inactivity.issues,false);assert.equal(c.inactivity.prs,false);
});
