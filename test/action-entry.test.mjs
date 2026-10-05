import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure } from '../src/config.mjs';
import { runAction } from '../src/action-entry.mjs';
import { execute } from '../src/runner.mjs';

const repository='Wolf/project';
const repositoryId=1330155388;
const sha='a'.repeat(40);
const actor={login:'wolfsblvt-automaton[bot]',type:'Bot'};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});

function sweepFetcher({failIssue}={}) {
  const old=new Date(Date.now()-100*86_400_000).toISOString();
  const c=configure({});
  const issues=new Map([7,8].map(number=>[number,{
    number,title:`Issue ${number}`,created_at:old,updated_at:old,state:'open',locked:false,
    labels:number===7?[{name:c.labels['control.no-auto-reply']}]:[],user:{login:'reporter',type:'User'}
  }]));
  const comments=new Map([[7,[]],[8,[]]]);
  const calls=[];
  const fetcher=async(target,options={})=>{
    const url=new URL(target),path=url.pathname+url.search,method=options.method??'GET';
    calls.push({method,path});
    if(method==='GET'&&path==='/repos/Wolf/project') return json({id:repositoryId,full_name:repository,default_branch:'main'});
    if(method==='GET'&&path===`/repos/${repository}/git/ref/heads/main`) return json({object:{sha}});
    if(method==='GET'&&path.startsWith(`/repos/${repository}/contents/policy.json?ref=`)) return json({type:'file',encoding:'base64',content:Buffer.from('{}').toString('base64')});
    if(method==='GET'&&path.startsWith(`/repos/${repository}/issues?state=all&`)) return json([issues.get(7)],200,{link:`<https://api.github.com/repositories/${repositoryId}/issues?state=all&per_page=100&page=2>; rel="next"`});
    if(method==='GET'&&path.startsWith(`/repositories/${repositoryId}/issues?state=all&`)) return json([issues.get(8)]);
    const issueMatch=path.match(/^\/repos\/Wolf\/project\/issues\/(\d+)(?:\/(comments|timeline|labels))?/);
    if(issueMatch) {
      const number=Number(issueMatch[1]);
      if(method==='GET'&&number===failIssue) return json({message:'fixture read failure'},500);
      if(method==='GET'&&!issueMatch[2]) return json(issues.get(number));
      if(method==='GET'&&issueMatch[2]==='comments') return json(comments.get(number));
      if(method==='GET'&&issueMatch[2]==='timeline') return json([]);
      if(method==='POST'&&issueMatch[2]==='comments') {
        const comment={id:comments.get(number).length+1,body:JSON.parse(options.body).body,user:actor,created_at:new Date().toISOString(),issue_url:`https://api.github.com/repos/${repository}/issues/${number}`};
        comments.get(number).push(comment);issues.get(number).updated_at=comment.created_at;
        return json(comment);
      }
      if(method==='POST'&&issueMatch[2]==='labels') {
        for(const name of JSON.parse(options.body).labels) if(!issues.get(number).labels.some(label=>label.name===name)) issues.get(number).labels.push({name});
        return json(issues.get(number).labels);
      }
    }
    if(method==='GET'&&path.startsWith(`/repos/${repository}/labels?`)) return json(Object.values(c.labels).map(name=>({name})));
    if(method==='GET'&&path.startsWith(`/repos/${repository}/pulls?state=`)) return json([]);
    if(method==='DELETE'&&path==='/installation/token') return new Response(null,{status:204});
    throw new Error(`Unexpected fixture request ${method} ${path}`);
  };
  return {fetcher,calls,issues,comments};
}

async function actionFiles(t) {
  const root=await mkdtemp(join(tmpdir(),'forgehand-entry-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const eventPath=join(root,'event.json'),outputPath=join(root,'output.txt'),summaryPath=join(root,'summary.md');
  await writeFile(eventPath,JSON.stringify({}));
  return {eventPath,outputPath,summaryPath};
}

function actionEnv(files,apply) {
  return {
    GITHUB_REPOSITORY:repository,
    AUTOMATION_POLICY:'policy.json',
    GITHUB_EVENT_PATH:files.eventPath,
    GITHUB_EVENT_NAME:'workflow_dispatch',
    GITHUB_REF:'refs/heads/main',
    GITHUB_OUTPUT:files.outputPath,
    GITHUB_STEP_SUMMARY:files.summaryPath,
    AUTOMATION_APPLY:String(apply),
    AUTOMATION_READ_TOKEN:'fixture-read-token',
    AUTOMATON_CLIENT_ID:'fixture-app-id',
    AUTOMATON_PRIVATE_KEY:'unused-by-fixture-mint'
  };
}

function actionRuntime(fetcher,{onMint=()=>{}}={}) {
  return options=>execute({...options,fetcher,mintToken:async({repository:requested})=>{
    assert.equal(requested,repository);
    onMint();
    return {token:'fixture-app-token'};
  }});
}

test('manual Action entry validates its ref, sweeps page-2 objects, and preserves real read failures',async t=>{
  const files=await actionFiles(t),backend=sweepFetcher(),logs=[];
  const executeRuntime=actionRuntime(backend.fetcher),logger={log:value=>logs.push(value),error:value=>logs.push(value)};

  let writerMinted=false;
  const refusedFiles=await actionFiles(t),refusedBackend=sweepFetcher();
  const refused=await runAction({
    env:{...actionEnv(refusedFiles,true),GITHUB_REF:'refs/pull/15/merge'},
    executeRuntime:actionRuntime(refusedBackend.fetcher,{onMint:()=>{writerMinted=true;}}),logger
  });
  assert.equal(refused.exitCode,1);assert.match(refused.error.message,/default-branch workflow/);
  assert.equal(writerMinted,false);assert.ok(refusedBackend.calls.every(call=>call.method==='GET'));
  assert.equal(refusedBackend.comments.get(7).length,0);assert.equal(refusedBackend.comments.get(8).length,0);

  const plan=await runAction({env:actionEnv(files,false),executeRuntime,logger});
  assert.equal(plan.exitCode,0);assert.equal(plan.result.status,'complete');assert.equal(plan.result.requiresWriter,true);
  assert.equal(plan.result.results[0].status,'blocked');assert.match(plan.result.results[0].planned.reason,/suppressed/);
  assert.equal(plan.result.results[1].status,'dry-run');
  assert.ok(backend.calls.some(call=>call.path.startsWith(`/repositories/${repositoryId}/issues?state=all`)));
  assert.equal((await readFile(files.outputPath,'utf8')),'requires-writer=true\n');

  const apply=await runAction({env:actionEnv(files,true),executeRuntime,logger});
  assert.equal(apply.exitCode,0);assert.equal(apply.result.status,'complete');
  assert.equal(apply.result.results[0].status,'blocked');assert.match(apply.result.results[0].planned.reason,/suppressed/);
  assert.equal(apply.result.results[1].status,'converged');
  assert.equal(backend.comments.get(7).length,0);assert.equal(backend.comments.get(8).length,1);
  assert.equal((await readFile(files.outputPath,'utf8')),'requires-writer=true\nrequires-writer=false\n');

  const failedFiles=await actionFiles(t),failedBackend=sweepFetcher({failIssue:8});
  const failed=await runAction({env:actionEnv(failedFiles,false),executeRuntime:actionRuntime(failedBackend.fetcher),logger});
  assert.equal(failed.exitCode,1);assert.equal(failed.result.status,'partial-failure');
  assert.equal(failed.result.results[0].status,'blocked');
  assert.ok(failed.result.errors.some(error=>error.includes('/issues/8 returned 500')));
  assert.equal((await readFile(failedFiles.outputPath,'utf8')),'requires-writer=false\n');
});
