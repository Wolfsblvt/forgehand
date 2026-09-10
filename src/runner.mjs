import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configure, merge, effectiveConfiguration } from './config.mjs';
import { GitHub } from './github.mjs';
import { Engine } from './engine.mjs';
import { appToken } from './auth.mjs';
import { labelPolicy } from './label-policy.mjs';
import { completionRefs, record } from './text.mjs';
const exec=promisify(execFile);
const diffdevilAdapters = Object.freeze({
  'diffdevil-cli-v1': Object.freeze({ command: 'diffdevil' })
});

export async function loadPolicy(gh,path) {
  const repository=await gh.get('');
  const branch=repository.default_branch;
  const sha=await gh.ref(branch);
  const raw=JSON.parse(await gh.file(path,sha));
  let selected=structuredClone(raw),applicability={};
  if(raw.labelPolicy) {
    const policy=JSON.parse(await gh.file(raw.labelPolicy,sha));
    const {mapping,areas,scopes}=labelPolicy(policy);
    applicability=scopes;
    if(raw.areas?.some(a=>!areas.some(x=>x.key===a.key))) throw new Error('Area override conflicts with canonical PR writer ownership');
    if(raw.labels && Object.entries(raw.labels).some(([k,v])=>mapping[k]&&mapping[k]!==v)) throw new Error('Conflicting label mapping; keep one canonical label policy');
    selected=merge(selected,{labels:{...mapping,...raw.labels},areas:raw.areas??areas});
  }
  for(const [purpose,template] of Object.entries(selected.messages??{})) {
    if(template && typeof template==='object' && typeof template.file==='string') selected.messages[purpose]=await gh.file(template.file,sha);
  }
  for(const group of ['replies','resolutions']) for(const rule of Object.values(selected[group]??{})) {
    if(rule?.message && typeof rule.message==='object' && typeof rule.message.file==='string') rule.message=await gh.file(rule.message.file,sha);
  }
  const config=configure(selected);
  config.labelScopes=applicability;
  return {config,raw:selected,branch,sha,repository};
}

/** diffdevil remains the only size/reply writer for its domain. Its executable is a finite runtime-owned adapter. */
export async function sizePR(gh,c,number,apply,{execute=exec}={}) {
  if(!c.diffdevil.enabled) return {status:'not-enabled',owner:'diffdevil'};
  const pr=await gh.get(`/pulls/${number}`);
  if(pr.state!=='open') return {status:'not-open'};
  const issue=await gh.get(`/issues/${number}`);
  if(issue.labels.some(l=>(l.name??l)===c.labels['control.manual-triage'])) return {status:'manual-triage'};
  const values={repository:gh.repository,number:String(number),head:pr.head.sha,base:pr.base.sha};
  const adapter=diffdevilAdapters[c.diffdevil.adapter];
  if(!adapter) throw new Error('Unsupported diffdevil adapter');
  const args=c.diffdevil.args.map(a=>{
    if(typeof a!=='string') throw new Error('diffdevil arguments must be strings');
    return a.replace(/\{(repository|number|head|base)\}/g,(_,k)=>values[k]);
  });
  if(!apply) return {status:'dry-run',adapter:c.diffdevil.adapter,args};
  if(!gh.writeToken) throw new Error('diffdevil requires the bounded App token for its own label/reply writes');
  // Never forward the private key, the whole process environment, or event-controlled shell source.
  const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',GH_TOKEN:gh.writeToken,GITHUB_TOKEN:gh.writeToken,GH_REPO:gh.repository,CI:'true'};
  try { await execute(adapter.command,args,{env,shell:false,windowsHide:true,maxBuffer:8*1024*1024}); }
  catch(error) { throw new Error(`diffdevil execution failed (${Number.isInteger(error.code)?error.code:'process error'}); inspect its qualified invocation without printing credential-bearing process output`); }
  const current=await gh.get(`/pulls/${number}`);
  if(current.head.sha!==pr.head.sha||current.base.sha!==pr.base.sha) throw new Error('diffdevil comparison moved during execution; rerun before claiming current size');
  const observed=await gh.get(`/issues/${number}`);
  const sizeNames=Object.entries(c.labels).filter(([k])=>k.startsWith('size.')).map(([,v])=>v);
  const sizeLabels=observed.labels.map(x=>x.name??x).filter(x=>sizeNames.includes(x));
  if(sizeNames.length && sizeLabels.length!==1) throw new Error('diffdevil did not leave exactly one configured size label; inspect its qualified label mode');
  return {status:'executed',head:pr.head.sha,base:pr.base.sha,sizeLabels};
}

export async function gatePR(gh,c,number,apply) {
  if(!c.gate.enabled) return {status:'not-enabled'};
  const pr=await gh.get(`/pulls/${number}`);
  const peers=(await gh.pages('/pulls?state=open')).filter(x=>x.head.sha===pr.head.sha);
  const failures=[];
  for(const peer of peers) {
    const snapshot=await gh.snapshot(peer.number,c);
    const selected=snapshot.issue.labels.map(l=>l.name??l);
    const authorized=k=>selected.includes(c.labels[k]) && snapshot.timeline.filter(e=>['labeled','unlabeled'].includes(e.event)&&e.label?.name===c.labels[k]).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||Number(b.id)-Number(a.id)).slice(0,1).some(e=>e.event==='labeled'&&snapshot.maintainers.includes(e.actor?.login));
    for(const k of c.gate.blockingLabels) if(authorized(k)) failures.push(`#${peer.number} has the selected merge blocker ${c.labels[k]}`);
    const explicit=c.gate.allowedMainLabels.some(authorized);
    const release=c.branches.next && peer.head.repo?.full_name===gh.repository && peer.head.ref===c.branches.next;
    if(c.gate.protectMain && peer.base.ref===c.branches.main && !explicit&&!release) failures.push(`#${peer.number} needs an authorized stable-line exception or a release from ${c.branches.next??'the selected release line'}`);
  }
  const result={name:`${c.gate.checkName} / ${c.branches.main}`,head_sha:pr.head.sha,status:'completed',conclusion:failures.length?'failure':'success',external_id:`forgehand:${gh.repository}:${pr.head.sha}:${c.branches.main}`,output:{title:failures.length?'Stable-line policy is not satisfied':'Stable-line policy is satisfied',summary:failures.join('\n')||'No current PR sharing this head violates the adopted branch/blocker rule. This is policy evidence, not implementation approval.'}};
  if(!apply) return {status:'dry-run',check:result};
  const fresh=await gh.get(`/pulls/${number}`);
  if(fresh.head.sha!==pr.head.sha||fresh.base.ref!==pr.base.ref) throw new Error('Head/target changed before the policy check write');
  const existing=await gh.get(`/commits/${pr.head.sha}/check-runs?check_name=${encodeURIComponent(result.name)}&per_page=100`);
  const old=existing.check_runs.find(x=>x.external_id===result.external_id&&x.app?.slug===c.actor.replace(/\[bot\]$/,''));
  if(old) await gh.write('PATCH',`/check-runs/${old.id}`,{status:result.status,conclusion:result.conclusion,output:result.output});
  else await gh.write('POST','/check-runs',result);
  const observed=await gh.get(`/commits/${pr.head.sha}/check-runs?check_name=${encodeURIComponent(result.name)}&per_page=100`);
  if(!observed.check_runs.some(x=>x.external_id===result.external_id&&x.conclusion===result.conclusion&&x.app?.slug===c.actor.replace(/\[bot\]$/,''))) throw new Error('Policy check result not observed');
  return {status:'observed',head:pr.head.sha,conclusion:result.conclusion};
}

async function pushCommits(gh,event) {
  if(!/^[a-f0-9]{40}$/.test(event.before??'')||! /^[a-f0-9]{40}$/.test(event.after??'')) throw new Error('Invalid push comparison');
  if(/^0+$/.test(event.before)) return []; // Initial import is not a historic closure/backfill instruction.
  let page=1,all=[],total;
  do {
    const comparison=await gh.get(`/compare/${event.before}...${event.after}?per_page=100&page=${page++}`);
    total=comparison.total_commits; all.push(...comparison.commits);
    if(!comparison.commits.length&&all.length<total) throw new Error('Incomplete push comparison');
  } while(all.length<total);
  if(all.length!==total) throw new Error('Push comparison changed during pagination');
  return all;
}

export async function runEvent({github:gh,policy,event,eventName,apply=false,now}) {
  const c=policy.config;
  if(event.repository?.full_name && event.repository.full_name!==gh.repository) throw new Error('Event repository mismatch');
  const allowed=['issues','issue_comment','pull_request_target','push','schedule','workflow_dispatch'];
  if(!allowed.includes(eventName)) throw new Error(`Unsupported privileged event: ${eventName}`);
  if(eventName==='workflow_dispatch'&&process.env.GITHUB_REF && process.env.GITHUB_REF!==`refs/heads/${policy.branch}`) throw new Error('Manual reconciliation must use the default-branch workflow');
  if(event.sender?.login===c.actor && ['issues','issue_comment','pull_request_target'].includes(eventName) && !event.pull_request?.merged) return {status:'own-event',results:[]};
  const engine=new Engine({github:gh,config:c,policySha:policy.sha,policyBranch:policy.branch,apply,...(now?{now}:{})});
  const results=[]; const errors=[];
  const attempt=async(fn)=>{
    try {
      const result=await fn(); results.push(result);
      for(const item of Array.isArray(result)?result:[result]) if(item?.status==='blocked') errors.push(item.reason??item.planned?.reason??'A selected transition is blocked');
    } catch(e) { errors.push(e.message); }
  };
  const number=event.issue?.number??event.pull_request?.number??Number(event.inputs?.number);
  if(Number.isSafeInteger(number)&&number>0) {
    const issue=await gh.get(`/issues/${number}`);
    if(eventName==='issues' || eventName==='pull_request_target') await attempt(()=>engine.intake(number));
    if(eventName==='issue_comment') await attempt(()=>engine.ownerCard(number,event.comment));
    if(issue.pull_request) {
      const pr=await gh.get(`/pulls/${number}`);
      if(pr.merged) { await attempt(()=>engine.merged(number)); await attempt(()=>engine.releaseSweep()); await attempt(()=>gatePR(gh,c,number,apply)); }
      else { await attempt(()=>engine.reconcile(number)); await engine.policyCurrent(); await attempt(()=>sizePR(gh,c,number,apply)); await attempt(()=>gatePR(gh,c,number,apply)); }
    } else await attempt(()=>engine.reconcile(number));
  } else if(eventName==='schedule'||eventName==='workflow_dispatch') {
    for(const item of await gh.pages('/issues?state=all')) await attempt(()=>engine.reconcile(item.number));
    await attempt(()=>engine.releaseSweep());
    for(const pr of await gh.pages('/pulls?state=closed')) if(pr.merged_at && [c.branches.main,c.branches.next].includes(pr.base.ref)) {
      await attempt(()=>engine.merged(pr.number,{recovery:true}));
      if(c.branches.next && pr.base.ref===c.branches.next) await attempt(()=>engine.merged(pr.number,{branch:c.branches.main,recovery:true}));
    }
    // Missed metadata events also converge; no dependence on a lossy hook queue.
    for(const pr of await gh.pages('/pulls?state=open')) {
      await engine.policyCurrent();
      await attempt(()=>sizePR(gh,c,pr.number,apply)); await attempt(()=>gatePR(gh,c,pr.number,apply));
    }
  } else if(eventName==='push') {
    const branch=event.ref?.replace(/^refs\/heads\//,'');
    if(![c.branches.main,c.branches.next].includes(branch)) return {status:'outside-release-lines',results};
    if(event.deleted) return {status:'deleted-branch',results};
    for(const commit of await pushCommits(gh,event)) {
      for(const n of completionRefs(commit.commit.message,gh.repository)) await attempt(()=>engine.complete(n,{pr:null,commit:commit.sha,branch}));
      for(const pr of await gh.pages(`/commits/${commit.sha}/pulls`)) if(pr.merged_at) await attempt(()=>engine.merged(pr.number,{branch}));
    }
    await attempt(()=>engine.releaseSweep());
  } else throw new Error('Event has no safely identifiable Issue/PR');
  return {status:errors.length?'partial-failure':'complete',results,errors,policySha:policy.sha};
}

export function requiresWriter(result) {
  if(Array.isArray(result)) return result.some(requiresWriter);
  if(!result || typeof result!=='object') return false;
  return result.status==='dry-run' || Object.values(result).some(requiresWriter);
}

export async function execute({repository,policyPath,event,eventName,apply=false,readToken,clientId,privateKey,fetcher=fetch,mintToken=appToken}) {
  const gh=new GitHub({repository,readToken,fetcher});
  const policy=await loadPolicy(gh,policyPath);
  const readPlan=await runEvent({github:gh,policy,event,eventName,apply:false});
  const writerNeeded=requiresWriter(readPlan);
  if(!apply || !writerNeeded) return {...readPlan,requiresWriter:writerNeeded};
  const auth=await mintToken({repository,clientId,privateKey,expectedSlug:policy.config.actor.replace(/\[bot\]$/,''),checks:policy.config.gate.enabled,fetcher});
  gh.writeToken=auth.token;
  let result,error;
  try { result=await runEvent({github:gh,policy,event,eventName,apply:true}); } catch(e) { error=e; }
  try { await gh.request('DELETE','/installation/token'); } catch(e) { throw new Error(`${error?error.message+'; ':''}installation-token revocation failed: ${e.message}`); }
  if(error) throw error;
  return {...result,requiresWriter:false};
}
