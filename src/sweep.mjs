import { completionRefs, record } from './text.mjs';

const pageSize=100;
const batchSize=20;
const pageInfo='totalCount pageInfo{hasNextPage endCursor}';
const selections={
  comments:`${pageInfo} nodes{body author{login __typename}}`,
  commits:`${pageInfo} nodes{commit{message}}`,
  closingIssuesReferences:`${pageInfo} nodes{number repository{nameWithOwner}}`
};

/** Read only the closed-subject histories used to rule out effects and recover completions.
 * Each connection is fully paginated; no state survives this invocation.
 */
export async function sweepEvidence(gh,issues,closedPRs,c) {
  const subjects=new Map();
  for(const issue of issues) {
    if(issue.state==='closed') subjects.set(issue.number,{number:issue.number,isPR:!!issue.pull_request,comments:[]});
  }
  for(const pr of closedPRs) {
    if(pr.merged_at && [c.branches.main,c.branches.next].includes(pr.base.ref)) {
      const subject=subjects.get(pr.number)??{number:pr.number,isPR:true,comments:[]};
      subject.commits=[];subject.closingIssuesReferences=[];
      subjects.set(pr.number,subject);
    }
  }
  if([...subjects.keys()].some(number=>!Number.isSafeInteger(number)||number<1)) throw new Error('Invalid sweep Issue/PR number');
  let pending=[...subjects.values()].flatMap(subject=>Object.keys(selections).filter(field=>field in subject).map(field=>({subject,field,after:null,seen:new Set(),total:null})));
  const [owner,name]=gh.repository.split('/');
  while(pending.length) {
    const batch=pending.splice(0,batchSize);
    const fields=batch.map(({subject,field,after},i)=>`s${i}:${subject.isPR?'pullRequest':'issue'}(number:${subject.number}){number ${field}(first:${pageSize},after:${JSON.stringify(after)}){${selections[field]}}}`).join('\n');
    const {data}=await gh.request('POST','/graphql',{query:`query($owner:String!,$name:String!){repository(owner:$owner,name:$name){${fields}}}`,variables:{owner,name}});
    if(data.errors?.length) throw new Error('GraphQL sweep evidence lookup failed');
    const repository=data.data?.repository;
    for(let i=0;i<batch.length;i++) {
      const item=batch[i],node=repository?.[`s${i}`],page=node?.[item.field];
      if(node?.number!==item.subject.number || !Array.isArray(page?.nodes) || page.nodes.some(x=>!x) || !Number.isSafeInteger(page.totalCount) || typeof page.pageInfo?.hasNextPage!=='boolean') throw new Error('Missing or incomplete GraphQL sweep evidence');
      if(item.total!==null && item.total!==page.totalCount) throw new Error('Sweep history changed during pagination');
      item.total=page.totalCount;
      if(page.nodes.length>pageSize || item.subject[item.field].length+page.nodes.length>item.total) throw new Error('Inconsistent GraphQL sweep history count');
      item.subject[item.field].push(...page.nodes);
      if(page.pageInfo.hasNextPage) {
        const cursor=page.pageInfo.endCursor;
        if(!cursor || item.seen.has(cursor) || !page.nodes.length) throw new Error('Incomplete or repeated GraphQL sweep pagination');
        item.seen.add(cursor);item.after=cursor;pending.push(item);
      } else if(item.subject[item.field].length!==item.total) throw new Error('Truncated GraphQL sweep history');
    }
  }
  const converged=new Set(),completions=new Map(),prs=new Map(closedPRs.map(pr=>[pr.number,pr]));
  for(const issue of issues) {
    const subject=subjects.get(issue.number);
    if(!subject) continue;
    const labels=new Set(issue.labels.map(x=>x.name??x));
    const manual=labels.has(c.labels['control.manual-triage']);
    const cleanup=!manual && c.cleanup.some(k=>c.labels[k] && labels.has(c.labels[k]) && (c.labelScopes===undefined || c.labelScopes[k]?.includes(issue.pull_request?'pr':'issue')));
    const pendingClose=subject.comments.some(x=>{
      if(typeof x.body!=='string' || !Object.hasOwn(x,'author') || (x.author && (typeof x.author.login!=='string' || !['User','Bot','Mannequin','Organization'].includes(x.author.__typename)))) throw new Error('Missing sweep comment ownership');
      const r=record({body:x.body,user:{login:x.author?.login,type:x.author?.__typename}},c.actor);
      return r?.status==='pending' && ['timeout','resolve'].includes(r.kind);
    });
    const terminal=prs.get(issue.number)?.merged_at || issue.locked || !c.reopen.enabled || manual || labels.has(c.labels['control.no-auto-reply']);
    if(terminal && !cleanup && !pendingClose) converged.add(issue.number);
  }
  for(const pr of closedPRs) {
    const subject=subjects.get(pr.number);
    if(!subject?.commits) continue;
    const refs=new Set(completionRefs(pr.body??'',gh.repository));
    for(const node of subject.commits) {
      if(typeof node.commit?.message!=='string') throw new Error('Missing sweep commit message');
      for(const number of completionRefs(node.commit.message,gh.repository)) refs.add(number);
    }
    for(const node of subject.closingIssuesReferences) {
      if(!Number.isSafeInteger(node.number) || !node.repository?.nameWithOwner) throw new Error('Missing sweep completion relationship');
      if(node.repository.nameWithOwner===gh.repository) refs.add(node.number);
    }
    completions.set(pr.number,[...refs]);
  }
  return {converged,completions};
}
