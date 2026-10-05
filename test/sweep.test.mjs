import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHub } from '../src/github.mjs';
import { execute, loadPolicy, runEvent, requiresWriter } from '../src/runner.mjs';
import { sweepEvidence } from '../src/sweep.mjs';
import { configure } from '../src/config.mjs';
import { fixture, actor, maintainer, date } from './fixture.mjs';
import { marker } from '../src/text.mjs';

const repository='Wolf/project',sha='b'.repeat(40);
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});

function provider({count=491,graphFailure,graphTruncated,graphRepeated,scopedControls=false}={}) {
  const objects=new Map(),calls=[];
  const raw={branches:{main:'main',next:'next',tryNextUrl:'https://example.invalid/next'},gate:{enabled:true,protectMain:false}};
  const c=configure(raw);
  const canonicalLabels={schemaVersion:1,labels:Object.entries(c.labels).map(([key,name])=>{
    const appliesTo=['control.manual-triage','control.no-auto-reply','state.awaiting-release'].includes(key)?['issue']:key==='state.stale'?['pr']:['issue','pr'];
    return {key,name,color:'abcdef',description:`${appliesTo.map(kind=>`[${kind.toUpperCase()}]`).join('')} Fixture label`,appliesTo,owner:Object.fromEntries(appliesTo.map(kind=>[kind,'agent']))};
  })};
  if(scopedControls) raw.labelPolicy='labels.json';
  for(let number=1;number<=count;number++) {
    const f=fixture({pr:number>8,overrides:raw,age:100});
    f.s.issue.number=number;
    f.s.issue.title=`Subject ${number}`;
    if(f.s.pr) {
      f.s.pr.number=number;
      f.s.issue.pull_request={};
      if(number>12) {
        f.state('closed',maintainer,95);
        f.s.pr.merged=true;f.s.pr.merged_at=date(95);f.s.pr.merge_commit_sha='a'.repeat(40);
        f.s.pr.commits=1;f.s.pr.body='No completion reference';
      }
    }
    if(number===1) f.label(c.labels['control.no-auto-reply']);
    if(number===2) f.label(c.labels['control.keep-open']);
    if(number===3) f.comment('/automaton await-response @reporter',maintainer,99);
    if(number===4) {
      f.state('closed',actor,95);
      f.comment(marker({version:1,id:'timeout',kind:'timeout',status:'closed',reopenEligible:true,closeEventId:f.s.timeline.at(-1).id,warningAt:date(80)}),actor,95);
      f.comment('Still relevant: a new reproduction.',undefined,100);
    }
    if(number===5) f.s.issue.locked=true;
    if(number===6) f.label(c.labels['control.manual-triage']);
    if(scopedControls && [9,10,11].includes(number)) {
      f.state('closed',actor,95);
      const closeEventId=f.s.timeline.at(-1).id;
      f.label(c.labels[number===10?'control.no-auto-reply':'control.manual-triage']);
      if(number===9) f.label(c.labels['state.stale']);
      else {
        f.comment(marker({version:1,id:'timeout',kind:'timeout',status:'closed',reopenEligible:true,closeEventId,warningAt:date(80)}),actor,95);
        f.comment('Still relevant: a new reproduction.',undefined,100);
      }
    }
    if(number===13) { f.s.pr.base.ref='next';f.s.pr.body='Fixes #2'; }
    if(number===14) f.s.pr.body='Fixes #5';
    if(number===15) f.label(c.labels['state.stale']); // closed cleanup
    if(number===16) {
      f.s.timeline.at(-1).actor=actor;
      f.comment(marker({version:1,id:'pending',kind:'timeout',status:'pending',beforeTransitionId:null}),actor,94);
    }
    if(number===17) for(let i=0;i<101;i++) f.comment(`Historical reply ${i}`,maintainer,90);
    if(number===18) f.s.pr.commits=101;
    objects.set(number,f);
  }
  const connection=(nodes,after)=>{
    const start=after?Number(after):0,end=Math.min(nodes.length,start+100);
    return {nodes:nodes.slice(start,end),totalCount:graphTruncated?nodes.length+1:nodes.length,pageInfo:{hasNextPage:end<nodes.length,endCursor:graphRepeated?'0':String(end)}};
  };
  const commits=n=>Array.from({length:n===18?101:1},(_,i)=>({commit:{message:n===18&&i===100?'Fixes #5':'Implementation'}}));
  const references=n=>n===19?[...Array.from({length:100},(_,i)=>({number:i+1,repository:{nameWithOwner:'outside/repo'}})),{number:5,repository:{nameWithOwner:repository}}]:[];
  const fetcher=async(target,options={})=>{
    const url=new URL(target),method=options.method??'GET';
    calls.push({method,path:url.pathname,query:url.search,body:options.body});
    const path=url.pathname.replace('/repositories/123/',`/repos/${repository}/`);
    if(path==='/graphql') {
      assert.equal(method,'POST');assert.equal(options.headers.Authorization,'Bearer reader');
      const {query}=JSON.parse(options.body);
      assert.match(query,/^query\b/);
      if(graphFailure) return json({errors:[{message:'unavailable'}]});
      const result={};
      for(const match of query.matchAll(/s(\d+):(pullRequest|issue)\(number:(\d+)\)\{number (\w+)\(first:100,after:(null|"[^"]*")\)/g)) {
        const [,alias,,n,field,cursor]=match,f=objects.get(Number(n)),after=JSON.parse(cursor);
        let nodes;
        if(field==='comments') nodes=f.s.comments.map(x=>({body:x.body,author:{login:x.user.login,__typename:x.user.type}}));
        if(field==='commits') nodes=commits(Number(n));
        if(field==='closingIssuesReferences') nodes=references(Number(n));
        result[`s${alias}`]={number:Number(n),[field]:connection(nodes,after)};
      }
      if(!Object.keys(result).length) {
        // Original completion relationship query, retained as the differential reference.
        const {variables}=JSON.parse(options.body);
        result.pullRequest={closingIssuesReferences:connection(references(variables.number),variables.after)};
      }
      return json({data:{repository:result}});
    }
    if(path==='/installation/token') return new Response(null,{status:204});
    if(path===`/repos/${repository}`) return json({id:123,full_name:repository,default_branch:'main'});
    if(path.includes('/git/ref/heads/')) return json({object:{sha}});
    if(path.includes('/contents/policy.json')) return json({type:'file',encoding:'base64',content:Buffer.from(JSON.stringify(raw)).toString('base64')});
    if(path.includes('/contents/labels.json')) {
      assert.equal(url.searchParams.get('ref'),sha);
      return json({type:'file',encoding:'base64',content:Buffer.from(JSON.stringify(canonicalLabels)).toString('base64')});
    }
    if(path.includes('/collaborators/')) return json({permission:path.includes('/collaborators/Wolf/')?'write':'read'});
    if(path.includes('/compare/')) return json({status:'ahead'});
    if(path===`/repos/${repository}/labels`) return json(Object.values(c.labels).map(name=>({name})));
    const list=values=>{
      const page=Number(url.searchParams.get('page')??1),start=(page-1)*100;
      const next=new URL(url);next.searchParams.set('page',String(page+1));
      next.pathname=next.pathname.replace(`/repos/${repository}`, '/repositories/123');
      return json(values.slice(start,start+100),200,start+100<values.length?{link:`<${next}>; rel="next"`}:{});
    };
    let values;
    if(path.endsWith('/issues') && method==='GET') values=[...objects.values()].map(f=>({...f.s.issue,...(f.s.pr?{pull_request:{merged_at:f.s.pr.merged_at}}:{})}));
    if(path.endsWith('/pulls')) values=[...objects.values()].filter(f=>f.s.pr?.state===url.searchParams.get('state')).map(f=>f.s.pr);
    if(path.endsWith('/issues/comments')) values=[...objects.values()].flatMap(f=>f.s.comments.map(x=>({...x,issue_url:`https://api.github.com/repos/${repository}/issues/${f.s.issue.number}`})));
    if(values) return list(values);
    const match=path.match(/\/(issues|pulls)\/(\d+)(?:\/(\w+))?/);
    if(match) {
      const [,kind,n,field]=match,f=objects.get(Number(n));
      if(method==='GET' && field==='commits') return list(commits(Number(n)));
      if(method==='GET' && ['comments','reviews','timeline','files'].includes(field)) {
        if(kind==='pulls') return json([]);
        return list(field==='comments'?f.s.comments:f.s.timeline);
      }
      if(method==='GET' && !field) return json(kind==='pulls'?f.s.pr:f.s.issue);
      if(method!=='GET') {
        assert.equal(options.headers.Authorization,'Bearer writer');
        const local=path.replace(`/repos/${repository}`,'').replace(`/${n}`, '/7');
        return json(await f.gh.write(method,local,options.body?JSON.parse(options.body):undefined),method==='DELETE'?200:201);
      }
    }
    const comment=path.match(/\/issues\/comments\/(\d+)/);
    if(comment) {
      // Comment ids in fixture objects share a range; mutation follows the last addressed object.
      const f=[...objects.values()].find(f=>f.s.comments.some(x=>x.id===Number(comment[1]) && x.user.login===actor.login));
      if(method==='GET') return json(f.s.comments.find(x=>x.id===Number(comment[1])));
      return json(await f.gh.write(method,`/issues/comments/${comment[1]}`,JSON.parse(options.body)));
    }
    if(path.includes('/check-runs')) {
      if(method==='GET') return json({check_runs:checks});
      const body=JSON.parse(options.body),check={...body,id:checks.length+1,app:{slug:'wolfsblvt-automaton'}};checks.push(check);return json(check);
    }
    throw new Error(`Unhandled fixture request ${method} ${path}`);
  };
  const checks=[];
  // Give comments globally unique REST ids without changing the per-object helper's writes.
  for(const [n,f] of objects) {
    f.clock.day=Math.floor((Date.now()-Date.UTC(2026,0,1))/86400000);
    const write=f.gh.write.bind(f.gh);
    f.gh.write=async(...args)=>{
      const result=await write(...args);
      if(args[0]==='POST'&&args[1].endsWith('/comments')) {
        f.s.comments.at(-1).id=result.id+n*1000;result.id=f.s.comments.at(-1).id;
        f.s.comments.at(-1).issue_url=`https://api.github.com/repos/${repository}/issues/${n}`;
      }
      return result;
    };
    for(const x of f.s.comments) { x.id+=n*1000;x.issue_url=`https://api.github.com/repos/${repository}/issues/${n}`; }
  }
  return {fetcher,calls,objects,c,checks};
}

async function journey(f,run=execute) {
  const args={repository,policyPath:'policy.json',event:{},eventName:'workflow_dispatch',workflowRef:'refs/heads/main',readToken:'reader',fetcher:f.fetcher,mintToken:async()=>({token:'writer'})};
  const preview=await run({...args,apply:false});
  const result=await run({...args,apply:true});
  return {preview,result};
}

// Same lifecycle algorithm with the pre-optimization reader surface; no sweep evidence or read coalescing.
async function referenceExecute(args) {
  const client=new GitHub(args),gh={repository:client.repository};
  for(const method of ['get','pages','ref','file','bindRepository','maintainer','snapshot','completionIssues','contains','write']) gh[method]=client[method].bind(client);
  const policy=await loadPolicy(gh,args.policyPath);
  const options={github:gh,policy,event:args.event,eventName:args.eventName,workflowRef:args.workflowRef};
  const preview=await runEvent({...options,apply:false}),needed=requiresWriter(preview);
  if(!args.apply||!needed) return {...preview,requiresWriter:needed};
  client.writeToken=(await args.mintToken()).token;
  const result=await runEvent({...options,apply:true});
  await client.request('DELETE','/installation/token');
  return {...result,requiresWriter:false};
}

test('complete 491-object enabled journey fits both budgets and preserves decisions and effects',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,5)});
  const optimized=provider(),reference=provider();
  const actual=await journey(optimized),expected=await journey(reference,referenceExecute);
  assert.deepEqual(actual,expected);
  assert.equal(actual.result.status,'complete');
  assert.equal(actual.result.results.find(x=>x.number===1).status,'blocked');
  assert.equal(optimized.objects.get(4).s.issue.state,'open');
  assert.equal(optimized.objects.get(2).s.issue.state,'closed');
  assert(optimized.objects.get(16).records().some(x=>x.id==='pending'&&x.status==='closed'));
  for(const [n,f] of optimized.objects) assert.deepEqual(f.s,reference.objects.get(n).s);
  assert.deepEqual(optimized.checks,reference.checks);
  const rest=optimized.calls.filter(x=>x.path!=='/graphql').length+3; // App identity, installation, token issuance
  const graph=optimized.calls.filter(x=>x.path==='/graphql');
  // Each batch has at most twenty independent first:100 connections: ceil(20/100), minimum one.
  // Charge an additional point per query for headroom, rather than using returned fixture cost.
  const points=graph.length*2;
  assert(rest<800,`REST: ${rest}`);assert(points<800,`GraphQL: ${points}`);
  t.diagnostic(JSON.stringify({objects:491,rest,graphRequests:graph.length,conservativeGraphPoints:points,referenceRest:reference.calls.filter(x=>x.path!=='/graphql').length+3}));
});

for(const [name,option,pattern] of [['unavailable',{graphFailure:true},/lookup failed/],['truncated',{graphTruncated:true},/Truncated/],['repeated cursor',{graphRepeated:true},/repeated|Inconsistent/]]) {
  test(`a ${name} history is an error, never a no-effect inference`,async()=>{
    const f=provider(option),gh=new GitHub({repository,readToken:'reader',fetcher:f.fetcher});gh.bindRepository({id:123,full_name:repository});
    await assert.rejects(sweepEvidence(gh,await gh.pages('/issues?state=all'),await gh.pages('/pulls?state=closed'),f.c),pattern);
    assert(!f.calls.some(x=>x.method!=='GET'&&x.path!=='/graphql'));
  });
}

test('canonical kind-scoped controls preserve closed PR cleanup and reopening',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,5)});
  const optimized=provider({count:20,scopedControls:true}),reference=provider({count:20,scopedControls:true});
  const actual=await journey(optimized),expected=await journey(reference,referenceExecute);
  assert.deepEqual(actual,expected);
  assert.equal(actual.result.status,'complete');
  assert(!optimized.objects.get(9).s.issue.labels.some(x=>x.name===optimized.c.labels['state.stale']));
  for(const number of [10,11]) assert.equal(optimized.objects.get(number).s.issue.state,'open');
  assert.equal(actual.result.results.find(x=>x.number===1).status,'blocked');
  assert.equal(optimized.objects.get(6).s.comments.length,0);
  for(const [number,f] of optimized.objects) assert.deepEqual(f.s,reference.objects.get(number).s);
  assert.deepEqual(optimized.checks,reference.checks);
  assert(optimized.calls.some(x=>x.path.endsWith('/contents/labels.json')));
});

test('a sweep discards planning reads before the writer is minted and honors changed suppression',async()=>{
  const f=provider({count:20});
  const result=await execute({repository,policyPath:'policy.json',event:{},eventName:'workflow_dispatch',workflowRef:'refs/heads/main',apply:true,readToken:'reader',fetcher:f.fetcher,mintToken:async()=>{
    f.objects.get(8).s.issue.labels.push({name:f.c.labels['control.no-auto-reply']});
    return {token:'writer'};
  }});
  assert.equal(result.status,'complete');
  assert.equal(result.results.find(x=>x.number===8).status,'blocked');
  assert.equal(f.objects.get(8).s.comments.length,0);
  assert(f.objects.get(7).s.comments.some(x=>x.user.login===actor.login));
});
