import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.mjs';
import { plan } from '../src/planner.mjs';
import { fixture,date,maintainer,reporter,actor } from './fixture.mjs';
const engine=f=>new Engine({github:f.gh,config:f.c,apply:true,now:f.clock.now});
const view=f=>({...f.s,replies:[...f.s.comments,...f.s.replies]});

for(const label of ['Confirmed','Approved','Needs Testing','Awaiting Release','Priority: High']) test(`${label} does not protect an inactive issue`,()=>{
 const f=fixture(); f.label(label); assert.equal(plan(view(f),f.c,f.clock.now())[0].purpose,'staleWarning');
});
test('default PR expiry warns after the product inactivity period',()=>{const f=fixture({pr:true});assert.equal(plan(view(f),f.c,f.clock.now())[0].purpose,'staleWarning');});
test('PR expiry can be explicitly disabled for a repository',()=>{const f=fixture({pr:true,overrides:{inactivity:{prs:false}}});assert.deepEqual(plan(view(f),f.c,f.clock.now()),[]);});
test('Keep Open is the explicit general exception',()=>{const f=fixture();f.label(f.c.labels['control.keep-open']);assert.deepEqual(plan(view(f),f.c,f.clock.now()),[]);});
test('company profile does not stale standing rooms by accident',()=>{const f=fixture({overrides:{profile:'company'}});assert.deepEqual(plan(view(f),f.c,f.clock.now()),[]);});
test('company profile can explicitly adopt expiry',()=>{const f=fixture({overrides:{profile:'company',inactivity:{issues:true}}});assert.equal(plan(view(f),f.c,f.clock.now())[0].purpose,'staleWarning');});

test('full warning → seven real days → close → phrase → reopen journey',async()=>{
 const f=fixture();const e=engine(f);
 await e.reconcile(7);assert.equal(f.s.issue.state,'open');assert.equal(f.records().filter(x=>x.kind==='staleWarning').length,1);
 f.clock.day+=6;await e.reconcile(7);assert.equal(f.s.issue.state,'open');
 f.clock.day+=1;await e.reconcile(7);assert.equal(f.s.issue.state,'closed');assert.equal(f.s.issue.state_reason,'not_planned');
 f.clock.day+=1;f.comment('Still relevant: reproduced on the current source.');await e.reconcile(7);assert.equal(f.s.issue.state,'open');
 assert(f.s.issue.labels.some(x=>x.name===f.c.labels['needs.triage']));assert.equal(f.records().filter(x=>x.kind==='timeout').length,1);
 await e.reconcile(7);assert.equal(f.records().filter(x=>x.kind==='reopened').length,1);
});
test('removing the stale label and other label housekeeping never reset the deadline',async()=>{
 const f=fixture();const e=engine(f);await e.reconcile(7);const warning=f.records().find(x=>x.kind==='staleWarning');
 f.clock.day+=6;f.s.issue.labels=[];f.label('Different topic');f.s.issue.updated_at=f.clock.now();await e.reconcile(7);
 assert.equal(f.records().find(x=>x.kind==='staleWarning').commentId,warning.commentId);
 f.clock.day+=1;await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('a non-bot reply resets general inactivity but bot replies do not',async()=>{
 const f=fixture();const e=engine(f);await e.reconcile(7);f.clock.day+=6;f.comment('bot chatter',actor);await e.reconcile(7);
 f.comment('I can still reproduce this.');await e.reconcile(7);f.clock.day+=2;await e.reconcile(7);assert.equal(f.s.issue.state,'open');
 assert(!f.s.issue.labels.some(x=>x.name===f.c.labels['state.stale']));
});
test('issue body edits, reactions and new commits are not discussion replies',async()=>{
 const f=fixture({pr:true,overrides:{inactivity:{prs:true}}});const e=engine(f);await e.reconcile(7);
 f.clock.day+=7;f.s.issue.updated_at=f.clock.now();f.s.issue.body='edited';f.s.issue.reactions={'+1':10};f.s.pr.head.sha='c'.repeat(40);
 await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('a delayed scheduler gives a real warning, not instant closure',async()=>{
 const f=fixture({age:500});await engine(f).reconcile(7);assert.equal(f.s.issue.state,'open');assert.equal(f.records()[0].createdAt,date(500));
});
test('an already-promised warning window does not shrink on configuration change',async()=>{
 const f=fixture({overrides:{inactivity:{warningDays:14}}});await engine(f).reconcile(7);f.c.inactivity.warningDays=7;f.clock.day+=8;
 await engine(f).reconcile(7);assert.equal(f.s.issue.state,'open');f.clock.day+=6;await engine(f).reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('ordinary post-closure chat does not reopen',async()=>{
 const f=fixture();const e=engine(f);await e.reconcile(7);f.clock.day+=7;await e.reconcile(7);f.clock.day++;f.comment('Same here');await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('manual closure defeats old bot receipts',async()=>{
 const f=fixture();const e=engine(f);await e.reconcile(7);f.clock.day+=7;await e.reconcile(7);f.clock.day++;f.state('open');f.state('closed');f.clock.day++;f.comment('still relevant: current version');
 await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('maintainer discussion after timeout prevents automatic reopening',async()=>{
 const f=fixture();const e=engine(f);await e.reconcile(7);f.clock.day+=7;await e.reconcile(7);f.clock.day++;f.comment('This is now superseded.',maintainer);f.clock.day++;f.comment('still relevant');await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('a maintainer reply in an earlier cycle is not a lifetime reopening ban',async()=>{
 const f=fixture();const e=engine(f);await e.reconcile(7);f.clock.day++;f.comment('Looking into this.',maintainer);await e.reconcile(7);
 f.clock.day+=91;await e.reconcile(7);f.clock.day+=7;await e.reconcile(7);f.clock.day++;f.comment('still relevant: another reproduction');await e.reconcile(7);assert.equal(f.s.issue.state,'open');
});
test('merged and locked PRs cannot be revived by a phrase',async()=>{
 const f=fixture({pr:true,overrides:{inactivity:{prs:true}}});const e=engine(f);await e.reconcile(7);f.clock.day+=7;await e.reconcile(7);f.clock.day++;f.comment('still relevant');f.s.pr.merged=true;
 await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('essential-response timer is anchored to an actual request',async()=>{
 const f=fixture({age:0});const e=engine(f);f.comment('Please provide a reproduction.\n/automaton await-response @reporter',maintainer);
 await e.reconcile(7);f.clock.day=14;await e.reconcile(7);assert(f.records().some(x=>x.kind==='responseWarning'));
 f.clock.day=20;f.comment('I see this too.',{type:'User',login:'someone-else'});await e.reconcile(7);f.clock.day=21;await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
 f.clock.day=22;f.comment('still relevant: here is a reproduction',{type:'User',login:'someone-else'});await e.reconcile(7);assert.equal(f.s.issue.state,'open');
});
test('Keep Open does not cancel an essential response request',async()=>{
 const f=fixture({age:0});const e=engine(f);f.comment('Details please\n/automaton await-response @reporter',maintainer);f.label(f.c.labels['control.keep-open']);
 await e.reconcile(7);f.clock.day=14;await e.reconcile(7);f.clock.day=21;await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('removing Awaiting Response after warning does not cancel the request',async()=>{
 const f=fixture({age:0});const e=engine(f);f.comment('Details please\n/automaton await-response @reporter',maintainer);await e.reconcile(7);f.clock.day=14;await e.reconcile(7);
 f.s.issue.labels=[];f.clock.day=21;await e.reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('requested person reply stops response consequence without a duplicate public reply',async()=>{
 const f=fixture({age:0});const e=engine(f);f.comment('Reproduction please\n/automaton await-response @reporter',maintainer);await e.reconcile(7);f.clock.day=14;await e.reconcile(7);
 f.clock.day=15;f.comment('Here is some more context.');await e.reconcile(7);f.clock.day=22;await e.reconcile(7);assert.equal(f.s.issue.state,'open');assert(!f.records().some(x=>x.kind==='responseReceived'));
});
test('an unauthorized command cannot start or cancel the response timer',async()=>{
 const f=fixture({age:0});f.comment('/automaton await-response @Wolf');await engine(f).reconcile(7);assert.equal(f.records().length,0);
});
test('explicit cancellation is available without abusing label edits',async()=>{
 const f=fixture({age:0});const e=engine(f);f.comment('Please answer\n/automaton await-response @reporter',maintainer);await e.reconcile(7);f.clock.day=14;await e.reconcile(7);
 f.clock.day=15;f.comment('/automaton cancel-response',maintainer);await e.reconcile(7);f.clock.day=22;await e.reconcile(7);assert.equal(f.s.issue.state,'open');
});
test('missing warning delivery cannot yield a silent timeout',async()=>{
 const f=fixture();f.label(f.c.labels['control.no-auto-reply']);const r=await engine(f).reconcile(7);assert.equal(r.status,'blocked');assert.equal(f.gh.writes.length,0);
});
test('source check fails before any mutation when policy moves',async()=>{
 const f=fixture();const e=new Engine({github:f.gh,config:f.c,apply:true,policySha:'c'.repeat(40),policyBranch:'main'});
 await assert.rejects(e.reconcile(7),/policy branch changed/);assert.equal(f.gh.writes.length,0);
});
test('area classification sees old rename paths and preserves unrelated labels',async()=>{
 const f=fixture({pr:true,overrides:{labels:{'area.api':'API'},areas:[{key:'area.api',include:['src/api/**'],exclude:[]}]}});f.s.files=[{filename:'other/x.mjs',previous_filename:'src/api/x.mjs'}];f.label('Manual meaning');
 await engine(f).reconcile(7);assert(f.s.issue.labels.some(x=>x.name==='API'));assert(f.s.issue.labels.some(x=>x.name==='Manual meaning'));
 f.s.files=[];await engine(f).reconcile(7);assert(!f.s.issue.labels.some(x=>x.name==='API'));assert(f.s.issue.labels.some(x=>x.name==='Manual meaning'));
});
test('manual resolution is not an automatic timeout',async()=>{
 const f=fixture({overrides:{labels:{'state.duplicate':'Duplicate'},resolutions:{'state.duplicate':{reason:'not_planned',message:'Duplicate of {{reference}}.',requiresReference:true}}}});
 f.comment('Same as #8',maintainer);f.label('Duplicate');await engine(f).reconcile(7);assert.equal(f.s.issue.state,'closed');f.clock.day++;f.comment('still relevant');await engine(f).reconcile(7);assert.equal(f.s.issue.state,'closed');
});
test('main closes and replies even without next or a published package',async()=>{
 const f=fixture();await engine(f).complete(7,{pr:23,commit:'a'.repeat(40),branch:'main'});assert.equal(f.s.issue.state,'closed');
 assert.match(f.s.comments[0].body,/stable \*\*main\*\* source/);assert.match(f.s.comments[0].body,/a{40}/);
});
test('native GitHub closure still receives the stable-source message',async()=>{
 const f=fixture();f.state('closed');await engine(f).complete(7,{pr:23,commit:'a'.repeat(40),branch:'main'});assert(f.records().some(x=>x.kind==='fixed'));assert.equal(f.s.issue.state,'closed');
});
test('next keeps issue open and tells people how to try it',async()=>{
 const f=fixture({overrides:{branches:{next:'next',tryNextUrl:'https://example.com/development'}}});await engine(f).complete(7,{pr:23,commit:'a'.repeat(40),branch:'next'});
 assert.equal(f.s.issue.state,'open');assert(f.s.issue.labels.some(x=>x.name===f.c.labels['state.awaiting-release']));assert.match(f.s.comments[0].body,/https:\/\/example.com\/development/);
});
test('repeated release reconciliation does not duplicate or override a later manual reopen',async()=>{
 const f=fixture();const e=engine(f);const evidence={pr:23,commit:'a'.repeat(40),branch:'main'};await e.complete(7,evidence);f.clock.day++;f.state('open');const before=f.s.comments.length;
 const result=await e.complete(7,evidence);assert.equal(result.status,'already-reconciled');assert.equal(f.s.issue.state,'open');assert.equal(f.s.comments.length,before);
});
test('an uncontained staged change is not falsely declared stable',async()=>{
 const f=fixture();f.gh.contains=async()=>false;const result=await engine(f).complete(7,{pr:23,commit:'a'.repeat(40),branch:'main'});assert.equal(result.status,'not-contained');assert.equal(f.s.issue.state,'open');
});
test('direct commit completion also works',async()=>{
 const f=fixture();await engine(f).complete(7,{pr:null,commit:'a'.repeat(40),branch:'main'});assert.equal(f.s.issue.state,'closed');assert.match(f.s.comments[0].body,/direct source integration/);
});
