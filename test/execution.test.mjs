import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appToken } from '../src/auth.mjs';
import { runEvent, loadPolicy, gatePR, execute, requiresWriter } from '../src/runner.mjs';
import { configure } from '../src/config.mjs';
import { Engine } from '../src/engine.mjs';
import { ownText, ownerCardLabels, wantsReopen, marker, record } from '../src/text.mjs';
import { GitHub } from '../src/github.mjs';
import { fixture, actor, maintainer, reporter, date } from './fixture.mjs';

const engine=f=>new Engine({github:f.gh,config:f.c,now:f.clock.now,apply:true});
const policy=f=>({config:f.c,branch:'main',sha:'b'.repeat(40)});
const response=(data,status=200)=>new Response(data===null?null:JSON.stringify(data),{status});

for(const body of ['````\n```\nstill relevant\n````','> Instructions:\nstill relevant','~~~js\nstill relevant\n~~\n~~~']) {
  test(`quoted/inert command remains inert: ${JSON.stringify(body)}`,()=>assert.equal(wantsReopen(body),false));
}
test('only explicit current owner-card headings qualify for owner-label projection',()=>{
  assert.deepEqual(ownerCardLabels('> [!IMPORTANT]\n> **Owner action — Connect the account**'),['owner.attention','owner.action-due']);
  assert.deepEqual(ownerCardLabels('**Owner co-design — Pick the palette**'),['owner.attention']);
  assert.deepEqual(ownerCardLabels('**Owner decision, co-design, steering, or action — ambiguous**'),[]);
  assert.deepEqual(ownerCardLabels('> > [!IMPORTANT]\n> > **Owner action — quoted history**\n\n```md\n**Owner decision — inert**\n```\n[!IMPORTANT] Wolf should read this.'),[]);
});
test('a blank line ends a lazy blockquote before a deliberate reply',()=>assert.equal(wantsReopen('> instructions\ncontinued\n\nstill relevant: fresh evidence'),true));
test('a qualifying maintainer owner card ensures the exact labels without taking over disposition',async()=>{
 const f=fixture({age:0,overrides:{ownerCards:{enabled:true},cleanup:['owner.attention','owner.action-due'],labels:{'owner.attention':'Wolf Attention','owner.action-due':'Wolf Action Due'}}});
 const e=engine(f),comment=f.comment('> [!IMPORTANT]\n> **Owner decision — Choose the source boundary**',maintainer);
 await e.ownerCard(7,{id:comment.id});assert.deepEqual(f.s.issue.labels.map(x=>x.name).sort(),['Wolf Action Due','Wolf Attention']);
 f.s.issue.labels=[];const prose=f.comment('[!IMPORTANT] Wolf attention is useful.',maintainer);await e.ownerCard(7,{id:prose.id});assert.deepEqual(f.s.issue.labels,[]);
 const untrusted=f.comment('**Owner action — Untrusted author**',reporter);await e.ownerCard(7,{id:untrusted.id});assert.deepEqual(f.s.issue.labels,[]);
});
test('owner-card projection re-reads the current comment, permission, room state, and Manual Triage before adding',async()=>{
 const f=fixture({age:0,overrides:{ownerCards:{enabled:true},cleanup:['owner.attention','owner.action-due'],labels:{'owner.attention':'Wolf Attention','owner.action-due':'Wolf Action Due','control.manual-triage':'Manual Triage'}}});
 const stale=f.comment('Ordinary prose after an edit.',maintainer),e=engine(f);
 await e.ownerCard(7,{id:stale.id,body:'**Owner action — stale event body**',user:maintainer});assert.deepEqual(f.s.issue.labels,[]);
 await e.ownerCard(7,{id:999});assert.deepEqual(f.s.issue.labels,[]);
 const card=f.comment('**Owner action — Current card**',maintainer);
 f.gh.maintainer=async()=>false;await e.ownerCard(7,{id:card.id});assert.deepEqual(f.s.issue.labels,[]);
 f.gh.maintainer=async()=>true;f.label('Manual Triage');await e.ownerCard(7,{id:card.id});assert.deepEqual(f.s.issue.labels,[{name:'Manual Triage'}]);
 f.s.issue.labels=[];f.state('closed');await e.ownerCard(7,{id:card.id});assert.deepEqual(f.s.issue.labels,[]);
});
test('the current Issue-comment event routes a qualifying owner card to the narrow projection',async()=>{
 const f=fixture({age:0,overrides:{ownerCards:{enabled:true},cleanup:['owner.attention','owner.action-due'],labels:{'owner.attention':'Wolf Attention','owner.action-due':'Wolf Action Due'}}});
 const card=f.comment('> [!IMPORTANT]\n> **Owner co-design — Read the result**',maintainer);
 await runEvent({github:f.gh,policy:policy(f),event:{issue:{number:7},comment:{id:card.id},sender:maintainer},eventName:'issue_comment',apply:true,now:f.clock.now});
 assert.deepEqual(f.s.issue.labels,[{name:'Wolf Attention'}]);
});
test('room closure clears selected owner reminders while preserving unrelated labels',async()=>{
 const f=fixture({overrides:{ownerCards:{enabled:true},cleanup:['owner.attention','owner.action-due'],labels:{'owner.attention':'Wolf Attention','owner.action-due':'Wolf Action Due'}}});
 f.label('Wolf Attention');f.label('Wolf Action Due');f.label('Unrelated manual label');f.state('closed');
  await engine(f).reconcile(7);assert.deepEqual(f.s.issue.labels,[{name:'Unrelated manual label'}]);
});
test('an already-converged owner card does not request the App writer, and reopen cleanup preserves its reminders',async()=>{
 const f=fixture({age:0,overrides:{ownerCards:{enabled:true},cleanup:['owner.attention','owner.action-due'],labels:{'owner.attention':'Wolf Attention','owner.action-due':'Wolf Action Due'}}});
 f.label('Wolf Attention');f.label('Wolf Action Due');const card=f.comment('**Owner action — Current card**',maintainer);
 const result=await runEvent({github:f.gh,policy:policy(f),event:{issue:{number:7},comment:{id:card.id},sender:maintainer},eventName:'issue_comment',apply:false,now:f.clock.now});
 assert.equal(requiresWriter(result),false);await engine(f).cleanup(7);assert.deepEqual(f.s.issue.labels.map(x=>x.name).sort(),['Wolf Action Due','Wolf Attention']);
 await engine(f).cleanup(7,{close:true});assert.deepEqual(f.s.issue.labels,[]);
});
test('initial hints apply once and respect an explicit removal',async()=>{
  const f=fixture({age:0}); const e=engine(f); await e.intake(7);
  assert(f.s.issue.labels.some(x=>x.name===f.c.labels['needs.triage']));
  f.s.issue.labels=[];f.s.timeline.push({id:100,event:'unlabeled',label:{name:f.c.labels['needs.triage']},actor:maintainer,created_at:date(1)});
  await e.intake(7);assert.equal(f.s.issue.labels.length,0);
});
test('literal title hints never establish approval',async()=>{
  assert.throws(()=>configure({intake:{rules:[{key:'state.approved',titlePrefix:'Approved:'}]},labels:{'state.approved':'Approved'}}),/hint/);
  const f=fixture({age:0,overrides:{labels:{'type.bug':'Bug'},intake:{rules:[{key:'type.bug',titlePrefix:'[Bug]:'}]}}});
  f.s.issue.title='[Bug]: Something failed';await engine(f).intake(7);
  assert(f.s.issue.labels.some(x=>x.name==='Bug'));
});
test('size domain cannot be acquired by a lifecycle reply or cleanup rule',()=>{
  assert.throws(()=>configure({labels:{'size.s':'Small'},replies:{'size.s':{message:'small'}}}),/reply/);
  assert.throws(()=>configure({labels:{'size.s':'Small'},resolutions:{'size.s':{reason:'completed',message:'close'}}}),/resolution/);
});
test('manually closing an issue clears only owned active state',async()=>{
  const f=fixture();f.label(f.c.labels['state.stale']);f.label('Manual information');f.state('closed');
  await engine(f).reconcile(7);assert.deepEqual(f.s.issue.labels,[{name:'Manual information'}]);
});
test('blocked transitions make the event result non-green',async()=>{
  const f=fixture();f.label(f.c.labels['control.no-auto-reply']);
  const r=await runEvent({github:f.gh,policy:policy(f),event:{issue:{number:7}},eventName:'issues',apply:true,now:f.clock.now});
  assert.equal(r.status,'partial-failure');assert.match(r.errors[0],/suppressed/);assert.equal(f.s.issue.state,'open');
});
test('untrusted execution events are rejected before mutation',async()=>{
  const f=fixture();await assert.rejects(runEvent({github:f.gh,policy:policy(f),event:{issue:{number:7}},eventName:'pull_request',apply:true}),/Unsupported privileged/);
  assert.equal(f.gh.writes.length,0);
});
test('own metadata events do not create feedback loops',async()=>{
  const f=fixture();const r=await runEvent({github:f.gh,policy:policy(f),event:{sender:actor,issue:{number:7}},eventName:'issue_comment',apply:true});
  assert.equal(r.status,'own-event');assert.equal(f.gh.writes.length,0);
});
test('later same-subject Issue events recover one-time opening intake',async()=>{
  const f=fixture({age:0});
  await runEvent({github:f.gh,policy:policy(f),event:{issue:{number:7},action:'labeled'},eventName:'issues',apply:true,now:f.clock.now});
  assert(f.s.issue.labels.some(x=>x.name===f.c.labels['needs.triage']));
});
test('a self event with no planned effect does not route to App authentication',async()=>{
  let minted=false;const sha='b'.repeat(40);
  const fetcher=async url=>{
    const target=new URL(url),path=target.pathname+target.search;
    if(path==='/repos/Wolf/project') return response({default_branch:'main'});
    if(path==='/repos/Wolf/project/git/ref/heads/main') return response({object:{sha}});
    if(path===`/repos/Wolf/project/contents/.github/automation/policy.json?ref=${sha}`) return response({type:'file',encoding:'base64',content:Buffer.from('{}').toString('base64')});
    throw new Error(`Unexpected read ${path}`);
  };
  const result=await execute({repository:'Wolf/project',policyPath:'.github/automation/policy.json',event:{sender:actor},eventName:'issue_comment',apply:true,readToken:'read-only',fetcher,mintToken:async()=>{minted=true;throw new Error('App credential should not be used');}});
  assert.equal(result.status,'own-event');assert.equal(result.requiresWriter,false);assert.equal(minted,false);
});
test('an Automaton source push still performs stable-source completion',async()=>{
  const f=fixture(),get=f.gh.get.bind(f.gh),pages=f.gh.pages.bind(f.gh);
  f.gh.get=async path=>path.startsWith('/compare/')?{total_commits:1,commits:[{sha:'c'.repeat(40),commit:{message:'Fixes #7'}}]}:get(path);
  f.gh.pages=async path=>path.startsWith('/commits/')?[]:pages(path);
  const r=await runEvent({github:f.gh,policy:policy(f),event:{sender:actor,ref:'refs/heads/main',before:'a'.repeat(40),after:'b'.repeat(40)},eventName:'push',apply:true,now:f.clock.now});
  assert.equal(r.status,'complete');assert.equal(f.s.issue.state,'closed');assert(f.records().some(x=>x.kind==='fixed'));
});
test('main push carries next PR completion even when staging replies were suppressed',async()=>{
  const f=fixture({overrides:{branches:{next:'next',tryNextUrl:'https://example.invalid/next'}}});
  f.label(f.c.labels['control.no-auto-reply']);
  const get=f.gh.get.bind(f.gh),pages=f.gh.pages.bind(f.gh),sha='c'.repeat(40);
  f.gh.completionIssues=async()=>[7];
  f.gh.get=async path=>path.startsWith('/compare/')?{total_commits:1,commits:[{sha,commit:{message:'Integrated feature'}}]}:
    path==='/pulls/11'?{number:11,merged:true,merge_commit_sha:sha,base:{ref:'next'},merged_at:date(99)}:get(path);
  f.gh.pages=async path=>path.startsWith('/commits/')?[{number:11,merged_at:date(99)}]:path==='/issues/comments'?[]:pages(path);
  const r=await runEvent({github:f.gh,policy:policy(f),event:{ref:'refs/heads/main',before:'a'.repeat(40),after:'b'.repeat(40)},eventName:'push',apply:true,now:f.clock.now});
  assert.equal(r.status,'complete');assert.equal(f.s.issue.state,'closed');assert.equal(f.s.comments.length,0);
});
test('a completed historical merge cannot re-close a later human reopening',async()=>{
  const f=fixture();f.state('closed',actor,80);f.state('open',maintainer,90);
  const r=await engine(f).complete(7,{pr:11,commit:'a'.repeat(40),branch:'main',integratedAt:date(80),recovery:true});
  assert.equal(r.status,'blocked');assert.equal(f.s.issue.state,'open');
});
test('ambiguous POST success is rediscovered rather than posting twice',async()=>{
  const f=fixture();const write=f.gh.write.bind(f.gh);let fail=true;
  f.gh.write=async(...args)=>{const r=await write(...args);if(fail&&args[0]==='POST'&&args[1].endsWith('/comments')){fail=false;throw new Error('transport lost after delivery');}return r;};
  await assert.rejects(engine(f).reconcile(7),/transport lost/);assert.equal(f.s.comments.length,1);
  await engine(f).reconcile(7);assert.equal(f.s.comments.length,1);
});
test('closure response loss recovers the current receipt and remains deliberately reopenable',async()=>{
  const f=fixture(),e=engine(f);await e.reconcile(7);f.clock.day+=7;
  const write=f.gh.write.bind(f.gh);let fail=true;
  f.gh.write=async(...args)=>{const r=await write(...args);if(fail&&args[0]==='PATCH'&&args[1]==='/issues/7'){fail=false;throw new Error('response lost after close');}return r;};
  await assert.rejects(e.reconcile(7),/response lost/);assert.equal(f.s.issue.state,'closed');assert(f.records().some(r=>r.kind==='timeout'&&r.status==='pending'));
  await e.reconcile(7);assert(f.records().some(r=>r.kind==='timeout'&&r.status==='closed'));
  f.clock.day++;f.comment('Still relevant: new reproduction.');await e.reconcile(7);assert.equal(f.s.issue.state,'open');
});
test('a pending receipt cannot adopt an intervening manual close/reopen',async()=>{
  const f=fixture(),e=engine(f);await e.reconcile(7);f.clock.day+=7;
  const write=f.gh.write.bind(f.gh);let fail=true;
  f.gh.write=async(...args)=>{const r=await write(...args);if(fail&&args[0]==='PATCH'&&args[1]==='/issues/7'){fail=false;throw new Error('lost');}return r;};
  await assert.rejects(e.reconcile(7));f.clock.day++;f.state('open');f.state('closed');await e.reconcile(7);
  f.clock.day++;f.comment('still relevant');await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('configuration and whole-message files are read at one accepted SHA',async()=>{
  const reads=[];const gh={get:async()=>({default_branch:'main'}),ref:async()=> 'a'.repeat(40),file:async(path,sha)=>{
    reads.push({path,sha});return path==='policy.json'?JSON.stringify({labelPolicy:'labels.json',messages:{fixedMain:{file:'fixed.md'}}}):
      path==='labels.json'?JSON.stringify({schemaVersion:1,labels:[{key:'area.api',name:'API',color:'7057FF',description:'[PR] Changes the API.',appliesTo:['pr'],owner:{pr:'automaton'},paths:{include:['api/**']}}]}):'Local voice: {{main}}';
  }};
  const p=await loadPolicy(gh,'policy.json');assert.equal(p.config.messages.fixedMain,'Local voice: {{main}}');assert.equal(p.config.areas[0].key,'area.api');assert(reads.every(x=>x.sha==='a'.repeat(40)));
});
test('configured branch gate distinguishes a qualified release from a same-named fork',async()=>{
  const f=fixture({pr:true,overrides:{branches:{next:'next',tryNextUrl:'https://example.invalid/next'},gate:{enabled:true}}});
  f.s.pr.head.ref='next';let r=await gatePR(f.gh,f.c,7,false);assert.equal(r.check.conclusion,'failure');
  f.s.pr.head.repo.full_name='Wolf/project';r=await gatePR(f.gh,f.c,7,false);assert.equal(r.check.conclusion,'success');
});
test('hard blockers are explicit and override a release exception',async()=>{
  const f=fixture({pr:true,overrides:{labels:{'local.merge-blocked':'Do not merge'},gate:{enabled:true,protectMain:false,blockingLabels:['local.merge-blocked']}}});
  f.label('Do not merge');const r=await gatePR(f.gh,f.c,7,false);assert.equal(r.check.conclusion,'failure');
});
test('a closed peer no longer poisons the head-shared branch check',async()=>{
  const f=fixture({pr:true,overrides:{gate:{enabled:true}}});f.state('closed');const pages=f.gh.pages.bind(f.gh);
  f.gh.pages=async p=>p==='/pulls?state=open'?[]:pages(p);
  const r=await gatePR(f.gh,f.c,7,false);assert.equal(r.check.conclusion,'success');
});
test('the read-query channel refuses GraphQL mutations',async()=>{
  const gh=new GitHub({repository:'Wolf/project',readToken:'fixture',fetcher:async()=>{throw new Error('must not call');}});
  await assert.rejects(gh.request('POST','/graphql',{query:'mutation { dangerous }'}),/read-only/);
});

const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'});
function authFixture({slug='wolfsblvt-automaton',repos=[{full_name:'Wolf/project'}],extra={},revokeStatus=204}={}) {
  const calls=[];const fetcher=async(url,options)=>{
    calls.push({url,options});
    if(options.method==='DELETE') return response(null,revokeStatus);
    const jwt=options.headers.Authorization.slice(7),[header,payload,signature]=jwt.split('.');
    assert(verify('RSA-SHA256',Buffer.from(`${header}.${payload}`),keys.publicKey,Buffer.from(signature,'base64url')));
    const decoded=JSON.parse(Buffer.from(payload,'base64url'));assert.equal(decoded.iss,'fixture-client');
    if(url.endsWith('/app'))return response({id:22,slug});
    if(url.endsWith('/installation'))return response({id:33,app_id:22});
    const body=JSON.parse(options.body);assert.deepEqual(body.repositories,['project']);
    return response({token:'not-a-real-token',repositories:repos,permissions:{...body.permissions,...extra}});
  };
  return {calls,fetcher};
}
const authArgs=f=>({repository:'Wolf/project',clientId:'fixture-client',privateKey,expectedSlug:'wolfsblvt-automaton',fetcher:f.fetcher});
test('App authentication mints only current-repository metadata effects',async()=>{
  const f=authFixture();const r=await appToken(authArgs(f));assert.equal(r.slug,'wolfsblvt-automaton');
  const p=JSON.parse(f.calls.at(-1).options.body).permissions;
  assert.deepEqual(p,{contents:'read',issues:'write',pull_requests:'write'});assert(!('checks' in p));
});
test('Checks write is only requested when the actual gate is selected',async()=>{
  const f=authFixture();await appToken({...authArgs(f),checks:true});assert.equal(JSON.parse(f.calls.at(-1).options.body).permissions.checks,'write');
});
test('wrong App identity fails before token issuance',async()=>{
  const f=authFixture({slug:'someone-else'});await assert.rejects(appToken(authArgs(f)),/different GitHub App/);assert.equal(f.calls.length,1);
});
test('an unexpectedly broad token is revoked rather than used',async()=>{
  const f=authFixture({extra:{contents:'write'}});await assert.rejects(appToken(authArgs(f)),/Unexpected installation-token permissions/);
  assert.equal(f.calls.at(-1).options.method,'DELETE');assert.equal(f.calls.at(-1).url,'https://api.github.com/installation/token');
});
test('a token for extra repositories is refused and revoked',async()=>{
  const f=authFixture({repos:[{full_name:'Wolf/project'},{full_name:'Wolf/private'}]});await assert.rejects(appToken(authArgs(f)),/exactly this repository/);assert.equal(f.calls.at(-1).options.method,'DELETE');
});
