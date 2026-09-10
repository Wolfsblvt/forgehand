import { plan, completionPlan } from './planner.mjs';
import { marker, ownerCardLabels, record, render, key } from './text.mjs';
import { messages } from './messages.mjs';

function text(c,purpose,values) {
  const selected=c.messages[purpose] ?? (purpose.startsWith('reply:')?c.replies[purpose.slice(6)]?.message:
    purpose.startsWith('resolution:')?c.resolutions[purpose.slice(11)]?.message:messages[purpose]);
  if(typeof selected!=='string') throw new Error(`Missing message template ${purpose}`);
  return render(selected,values);
}
const stamp = (data) => marker({version:1,...data});

/** Sole lifecycle writer. No wholesale label replacement, implicit token fallback or PR code execution. */
export class Engine {
  constructor({github,config,policySha,policyBranch,now=()=>new Date().toISOString(),apply=false}) {
    this.gh=github; this.c=config; this.policySha=policySha; this.policyBranch=policyBranch; this.now=now; this.apply=apply;
  }
  async policyCurrent() {
    if(this.policySha && await this.gh.ref(this.policyBranch)!==this.policySha) throw new Error('Trusted policy branch changed; restart with the newly accepted policy');
  }
  async labelsExist(names) {
    const definitions=await this.gh.pages('/labels');
    const existing=new Set(definitions.map(x=>x.name));
    const missing=names.filter(x=>x&&!existing.has(x));
    if(missing.length) throw new Error(`Managed label definitions are missing: ${missing.join(', ')}. Provision them through repository setup, not this event.`);
  }
  async add(number,label) {
    await this.labelsExist([label]);
    await this.gh.write('POST',`/issues/${number}/labels`,{labels:[label]});
    if(!(await this.gh.get(`/issues/${number}`)).labels.some(x=>(x.name??x)===label)) throw new Error(`Label addition was not observed: ${label}`);
  }
  async remove(number,label) {
    const current=await this.gh.get(`/issues/${number}`);
    if(current.labels.some(x=>(x.name??x)===label)) {
      await this.gh.write('DELETE',`/issues/${number}/labels/${encodeURIComponent(label)}`);
      if((await this.gh.get(`/issues/${number}`)).labels.some(x=>(x.name??x)===label)) throw new Error(`Label removal was not observed: ${label}`);
    }
  }
  async cleanup(number,{close=false}={}) {
    for(const k of this.c.cleanup) {
      if(!close && this.c.ownerCards.enabled && ['owner.attention','owner.action-due'].includes(k)) continue;
      await this.remove(number,this.c.labels[k]);
    }
  }
  async message(number,id,purpose,values,data={}) {
    const comments=await this.gh.pages(`/issues/${number}/comments`);
    const existing=comments.find(x=>record(x,this.c.actor)?.id===id);
    if(existing) return existing;
    const body=`${text(this.c,purpose,values)}\n\n${stamp({id,kind:purpose,...data})}`;
    // Do not retry an ambiguous POST. The next run rediscovers the App-owned id first.
    const posted=await this.gh.write('POST',`/issues/${number}/comments`,{body});
    if(posted.user?.login!==this.c.actor||posted.user?.type!=='Bot') throw new Error('Unexpected outward comment actor; stop and inspect this credential');
    return posted;
  }
  async updateRecord(number,comment,purpose,values,data) {
    const fresh=await this.gh.get(`/issues/comments/${comment.id}`);
    if(!record(fresh,this.c.actor)) throw new Error('Comment ownership changed');
    return this.gh.write('PATCH',`/issues/comments/${comment.id}`,{body:`${text(this.c,purpose,values)}\n\n${stamp(data)}`});
  }
  async intake(number) {
    await this.policyCurrent();
    const s=await this.gh.snapshot(number,this.c);
    if(s.issue.state!=='open'||!(s.pr?this.c.intake.prs:this.c.intake.issues)||s.issue.labels.some(x=>(x.name??x)===this.c.labels['control.manual-triage'])) return {number,status:'intake-not-selected'};
    const wanted=new Set([...this.c.intake.labels,...this.c.intake.rules.filter(r=>s.issue.title?.startsWith(r.titlePrefix)).map(r=>r.key)]);
    const selected=[...wanted].filter(k=>(!this.c.labelScopes?.[k] || this.c.labelScopes[k].includes(s.pr?'pr':'issue')) && !s.issue.labels.some(l=>(l.name??l)===this.c.labels[k]) && !s.timeline.some(e=>['labeled','unlabeled'].includes(e.event)&&e.label?.name===this.c.labels[k]));
    if(!this.apply) return {number,status:'dry-run',initialHints:selected};
    for(const k of selected) { await this.policyCurrent(); await this.add(number,this.c.labels[k]); }
    return {number,status:'intake-applied',initialHints:selected};
  }
  async currentOwnerCard(number, commentId) {
    if (!Number.isSafeInteger(commentId) || commentId < 1) return {number,status:'owner-card-not-current'};
    await this.policyCurrent();
    let comment;
    try { comment=await this.gh.get(`/issues/comments/${commentId}`); }
    catch(error) { if(error.status===404) return {number,status:'owner-card-not-current'}; throw error; }
    const issueUrl=`https://api.github.com/repos/${this.gh.repository}/issues/${number}`;
    if (!comment || comment.issue_url!==issueUrl || !comment.body || !ownerCardLabels(comment.body).length || !await this.gh.maintainer(comment.user?.login,{fresh:true})) return {number,status:'owner-card-not-current'};
    const s=await this.gh.snapshot(number,this.c);
    if (s.pr || s.issue.state!=='open') return {number,status:'owner-card-not-current'};
    const current=new Set(s.issue.labels.map(x=>x.name??x));
    if (current.has(this.c.labels['control.manual-triage'])) return {number,status:'manual-triage'};
    return {number,status:'owner-card-current',ownerCardLabels:ownerCardLabels(comment.body),current};
  }
  async ownerCard(number, comment) {
    if (!this.c.ownerCards.enabled) return {number,status:'owner-card-not-selected'};
    const initial=await this.currentOwnerCard(number,comment?.id);
    if (initial.status!=='owner-card-current') return initial;
    const selected=initial.ownerCardLabels.filter(key=>!initial.current.has(this.c.labels[key]));
    if (!selected.length) return {number,status:'owner-card-converged',ownerCardLabels:[]};
    if (!this.apply) return {number,status:'dry-run',ownerCardLabels:selected};
    const applied=[];
    for (const key of selected) {
      const current=await this.currentOwnerCard(number,comment.id);
      if (current.status!=='owner-card-current') return {number,status:current.status,ownerCardLabels:applied};
      if (!current.ownerCardLabels.includes(key)) return {number,status:'owner-card-not-current',ownerCardLabels:applied};
      if (current.current.has(this.c.labels[key])) continue;
      await this.add(number,this.c.labels[key]);
      applied.push(key);
    }
    return {number,status:applied.length?'owner-card-applied':'owner-card-converged',ownerCardLabels:applied};
  }
  async recoverClose(number,s) {
    if(!this.apply || s.issue.state!=='closed') return false;
    const transitions=[...s.timeline].filter(x=>['closed','reopened'].includes(x.event)).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||Number(a.id)-Number(b.id));
    const last=transitions.at(-1),before=transitions.at(-2);
    const records=s.comments.map(x=>record(x,this.c.actor)).filter(Boolean);
    const pending=records.filter(r=>['timeout','resolve'].includes(r.kind)&&r.status==='pending'&&Date.parse(r.createdAt)<=Date.parse(last?.created_at));
    if(pending.length!==1||last?.event!=='closed'||last.actor?.login!==this.c.actor||String(pending[0].beforeTransitionId??'')!==String(before?.id??'')) return false;
    if(records.some(r=>r.id!==pending[0].id&&['timeout','resolve','fixed'].includes(r.kind)&&Date.parse(r.createdAt)>=Date.parse(pending[0].createdAt))) return false;
    const r=pending[0],comment=s.comments.find(x=>x.id===r.commentId);
    const fresh=await this.gh.get(`/issues/comments/${comment.id}`);
    const actual=record(fresh,this.c.actor);
    if(actual?.id!==r.id||actual.status!=='pending') return false;
    const data={...actual,status:'closed',closeEventId:last.id,closedAt:last.created_at};
    delete data.commentId;delete data.createdAt;delete data.body;
    const body=fresh.body.replace(/^<!-- forgehand:v1:[\w-]+ -->$/gm,'').trimEnd()+'\n\n'+stamp(data);
    await this.policyCurrent();await this.gh.write('PATCH',`/issues/comments/${comment.id}`,{body});
    return true;
  }
  async reconcile(number) {
    const actions=[];
    // Finite fixed-point guard catches an implementation loop; this is not an event-delivery retry policy.
    for(let step=0;step<40;step++) {
      await this.policyCurrent();
      const s=await this.gh.snapshot(number,this.c);
      if(await this.recoverClose(number,s)) { actions.push({type:'recovered-close-receipt'}); continue; }
      const effects=plan(s,this.c,this.now());
      if(!effects.length) return {number,actions,status:'converged'};
      const e=effects[0];
      if(!this.apply || e.type==='blocked') {
        const preview={...e};
        if(e.purpose) preview.renderedMessage=text(this.c,e.purpose,e.values);
        return {number,actions,planned:preview,status:e.type==='blocked'?'blocked':'dry-run'};
      }
      await this.policyCurrent();
      if(e.type==='message') await this.message(number,e.id,e.purpose,e.values,e.record);
      else if(e.type==='addLabel') await this.add(number,e.label);
      else if(e.type==='removeLabel') await this.remove(number,e.label);
      else if(e.type==='timeout'||e.type==='resolve') await this.close(number,e);
      else if(e.type==='reopen') await this.reopen(number,e);
      else throw new Error(`Unsupported effect ${e.type}`);
      actions.push({type:e.type,id:e.id,key:e.key});
    }
    throw new Error('Reconciliation did not converge; inspect the rules, no further effects attempted');
  }
  async close(number,e) {
    const before=await this.gh.snapshot(number,this.c);
    const current=plan(before,this.c,this.now())[0];
    if(current?.id!==e.id||current.type!==e.type) return;
    if(e.type==='resolve' && e.values.reference) {
      const target=e.values.reference.match(/(?:https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/|#)(\d+)/);
      if(!target || target[1]&&target[1]!==this.gh.repository || Number(target[2])===number) throw new Error('Resolution reference must be a different subject in this repository');
      await this.gh.get(`/issues/${Number(target[2])}`);
    }
    e=current;
    const prior=[...before.timeline].filter(x=>['closed','reopened'].includes(x.event)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||Number(b.id)-Number(a.id))[0];
    const data={...e,kind:e.type,status:'pending',beforeTransitionId:prior?.id??null}; delete data.values; delete data.purpose; delete data.type;
    const comment=await this.message(number,e.id,e.purpose,e.values,data);
    await this.policyCurrent();
    const fresh=await this.gh.snapshot(number,this.c);
    const valid=plan(fresh,this.c,this.now())[0];
    if(valid?.id!==e.id||valid.type!==e.type) {
      await this.updateRecord(number,comment,'closeAborted',e.values,{...data,status:'cancelled'}); return;
    }
    const path=fresh.pr?`/pulls/${number}`:`/issues/${number}`;
    await this.gh.write('PATCH',path,{state:'closed',...(!fresh.pr?{state_reason:e.reason??'not_planned'}:{})});
    const observed=await this.gh.snapshot(number,this.c);
    const close=[...observed.timeline].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||Number(b.id)-Number(a.id)).find(x=>['closed','reopened'].includes(x.event));
    if(observed.issue.state!=='closed'||close?.event!=='closed'||close.actor?.login!==this.c.actor) throw new Error('Closure was not attributable on readback; automatic reopening remains unqualified');
    await this.updateRecord(number,comment,e.purpose,e.values,{...data,status:'closed',closeEventId:close.id,closedAt:close.created_at});
    await this.cleanup(number,{close:true});
    if(e.lock) await this.gh.write('PUT',`/issues/${number}/lock`,{lock_reason:e.lock});
  }
  async reopen(number,e) {
    const fresh=await this.gh.snapshot(number,this.c);
    if(plan(fresh,this.c,this.now())[0]?.id!==e.id) return;
    await this.gh.write('PATCH',fresh.pr?`/pulls/${number}`:`/issues/${number}`,{state:'open',...(!fresh.pr?{state_reason:'reopened'}:{})});
    const observed=await this.gh.get(`/issues/${number}`);
    if(observed.state!=='open') throw new Error('Reopen was not observed');
    await this.cleanup(number);
    if(this.c.labels['needs.triage']) await this.add(number,this.c.labels['needs.triage']);
    await this.message(number,e.id,'reopened',e.values,{kind:'reopened',closeEventId:e.closeEventId,requestId:e.requestId});
  }
  async complete(number,completion) {
    await this.policyCurrent();
    let issue=await this.gh.get(`/issues/${number}`);
    if(issue.pull_request) throw new Error('Completion target must be an Issue, not another PR');
    const p=completionPlan(issue,this.c,completion);
    if(!p) return {number,status:'outside-release-lines'};
    const prior=(await this.gh.pages(`/issues/${number}/comments`)).map(x=>record(x,this.c.actor)).find(x=>x?.id===p.id && x.status==='complete');
    if(prior) return {number,status:'already-reconciled'};
    if(completion.recovery && issue.state==='open') {
      const timeline=await this.gh.pages(`/issues/${number}/timeline`);
      const reopen=timeline.filter(e=>e.event==='reopened'&&e.actor?.login!==this.c.actor).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))[0];
      if(reopen && (!completion.integratedAt || Date.parse(reopen.created_at)>=Date.parse(completion.integratedAt))) return {number,status:'blocked',reason:'Historical completion cannot override a later manual reopening without new integration evidence'};
    }
    const branchSha=await this.gh.ref(completion.branch);
    if(!await this.gh.contains(completion.commit,branchSha)) return {number,status:'not-contained'};
    const values={kind:'issue',main:this.c.branches.main,branch:completion.branch,prUrl:completion.pr?`https://github.com/${this.gh.repository}/pull/${completion.pr}`:'direct source integration',commitUrl:`https://github.com/${this.gh.repository}/commit/${completion.commit}`,tryNextUrl:this.c.branches.tryNextUrl};
    const purpose=p.type==='fixed'?'fixedMain':'awaitingRelease';
    const labels=issue.labels.map(x=>x.name??x);
    const suppress=labels.includes(this.c.labels['control.no-auto-reply'])||labels.includes(this.c.labels['control.manual-triage']);
    if(!this.apply) return {number,status:'dry-run',completion:p,renderedMessage:text(this.c,purpose,values)};
    // Suppression is not a promise to post. Stable-source closure still means fixed on main.
    const receipt=!suppress?await this.message(number,p.id,purpose,values,{kind:p.type,status:'pending',pr:completion.pr,commit:completion.commit,branch:completion.branch}):null;
    if(p.type==='staged') {
      if(issue.state==='open' && !labels.includes(this.c.labels['control.manual-triage'])) await this.add(number,this.c.labels['state.awaiting-release']);
      if(receipt) await this.updateRecord(number,receipt,purpose,values,{id:p.id,kind:p.type,status:'complete',pr:completion.pr,commit:completion.commit,branch:completion.branch});
      return {number,status:'staged',comment:suppress?'suppressed':'present'};
    }
    await this.policyCurrent();
    if(!await this.gh.contains(completion.commit,await this.gh.ref(completion.branch))) throw new Error('Stable containment changed before close');
    issue=await this.gh.get(`/issues/${number}`);
    if(issue.state==='open') await this.gh.write('PATCH',`/issues/${number}`,{state:'closed',state_reason:'completed'});
    await this.remove(number,this.c.labels['state.awaiting-release']); await this.cleanup(number,{close:true});
    if((await this.gh.get(`/issues/${number}`)).state!=='closed') throw new Error('Stable Issue closure not observed');
    if(receipt) await this.updateRecord(number,receipt,purpose,values,{id:p.id,kind:p.type,status:'complete',pr:completion.pr,commit:completion.commit,branch:completion.branch});
    return {number,status:'fixed-in-stable-source',comment:suppress?'suppressed':'present'};
  }
  async merged(number, {branch, recovery=false}={}) {
    const pr=await this.gh.get(`/pulls/${number}`);
    if(!pr.merged||![this.c.branches.main,this.c.branches.next].includes(pr.base.ref)) return [];
    const target=branch??pr.base.ref;
    const issues=await this.gh.completionIssues(pr),results=[];
    for(const n of issues) results.push(await this.complete(n,{pr:number,commit:pr.merge_commit_sha,branch:target,recovery,integratedAt:pr.base.ref===target?pr.merged_at:null}));
    return results;
  }
  async releaseSweep() {
    if(!this.c.branches.next) return [];
    const mainSha=await this.gh.ref(this.c.branches.main);
    const comments=await this.gh.pages('/issues/comments'); const results=[];
    for(const comment of comments) {
      const r=record(comment,this.c.actor);
      if(r?.kind!=='staged'||!await this.gh.contains(r.commit,mainSha)) continue;
      const match=comment.issue_url?.match(/\/issues\/(\d+)$/);
      if(!match || !comment.issue_url.startsWith(`https://api.github.com/repos/${this.gh.repository}/issues/`)) throw new Error('Unexpected staged receipt target');
      results.push(await this.complete(Number(match[1]),{pr:r.pr,commit:r.commit,branch:this.c.branches.main,recovery:true}));
    }
    return results;
  }
}
