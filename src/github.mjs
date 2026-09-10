import { completionRefs, human } from './text.mjs';

export class GitHub {
  constructor({repository,readToken,writeToken,fetcher=fetch}) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Expected owner/repository');
    this.repository=repository; this.root=`/repos/${repository}`;
    this.readToken=readToken; this.writeToken=writeToken; this.fetcher=fetcher;
    this.permissionCache=new Map();
  }
  async request(method,path,body) {
    if (!(path.startsWith(this.root+'/') || path===this.root || path==='/graphql' || path==='/installation/token')) throw new Error('Request escaped the current repository');
    if(path==='/graphql' && (method!=='POST' || !/^query\b/.test(body?.query??''))) throw new Error('Only explicit read-only GraphQL queries are supported');
    const mutation=method!=='GET' && path!=='/graphql';
    const token=mutation?this.writeToken:this.readToken;
    if (mutation && !token) throw new Error('No bounded App writer; never fall back to GITHUB_TOKEN');
    const response=await this.fetcher(`https://api.github.com${path}`,{
      method,redirect:'error',headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'forgehand',...(token?{Authorization:`Bearer ${token}`}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    if (!response.ok) {
      const error=new Error(`GitHub ${method} ${path.split('?')[0]} returned ${response.status}; inspect the run, permissions and current object before retrying.`);
      error.status=response.status; throw error;
    }
    return {data:response.status===204?null:await response.json(),link:response.headers.get('link')};
  }
  async get(path) { return (await this.request('GET',this.root+path)).data; }
  async write(method,path,body) { return (await this.request(method,this.root+path,body)).data; }
  async pages(path) {
    let next=this.root+path+(path.includes('?')?'&':'?')+'per_page=100';
    const values=[]; const visited=new Set();
    while (next) {
      if (visited.has(next)) throw new Error('Repeated pagination link');
      visited.add(next);
      const {data,link}=await this.request('GET',next);
      if(!Array.isArray(data)) throw new Error(`Expected list at ${path}`);
      values.push(...data);
      const match=link?.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        const url=new URL(match[1]);
        if(url.origin!=='https://api.github.com' || !url.pathname.startsWith(this.root+'/')) throw new Error('Untrusted pagination URL');
        next=url.pathname+url.search;
      } else next=null;
    }
    return values;
  }
  async ref(branch) { return (await this.get(`/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha; }
  async file(path,sha) {
    if (!path || path.startsWith('/') || path.split('/').some(p=>p==='..'||p==='.') || path.includes('\\')) throw new Error('Unsafe repository file path');
    const file=await this.get(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(sha)}`);
    if(file.type!=='file'||file.encoding!=='base64'||file.submodule_git_url||file.target) throw new Error(`Not a regular readable policy file: ${path}`);
    return Buffer.from(file.content,'base64').toString('utf8');
  }
  async maintainer(login, { fresh = false } = {}) {
    if (!login) return false;
    if (fresh || !this.permissionCache.has(login)) {
      try {
        const p=await this.get(`/collaborators/${encodeURIComponent(login)}/permission`);
        const allowed=['admin','maintain','write'].includes(p.permission);
        this.permissionCache.set(login,allowed);
        return allowed;
      } catch(e) { if(e.status!==404) throw e; this.permissionCache.set(login,false); return false; }
    }
    return this.permissionCache.get(login);
  }
  async snapshot(number,c) {
    if(!Number.isSafeInteger(number)||number<1) throw new Error('Invalid Issue/PR number');
    const issue=await this.get(`/issues/${number}`);
    const pr=issue.pull_request?await this.get(`/pulls/${number}`):null;
    if(pr && pr.base.repo.full_name!==this.repository) throw new Error('PR base repository mismatch');
    const [comments,timeline]=await Promise.all([this.pages(`/issues/${number}/comments`),this.pages(`/issues/${number}/timeline`)]);
    let replies=comments.map(x=>({...x,source:'comment'})), files=[],filesComplete=true;
    if(pr) {
      const [reviewComments,reviews]=await Promise.all([this.pages(`/pulls/${number}/comments`),this.pages(`/pulls/${number}/reviews`)]);
      replies.push(...reviewComments.map(x=>({...x,source:'review-comment'})),...reviews.filter(x=>x.submitted_at).map(x=>({...x,created_at:x.submitted_at,source:'review'})));
      if(pr.state==='open' && c.areas.length) {
        files=await this.pages(`/pulls/${number}/files`);
        filesComplete=files.length===pr.changed_files;
        if(!filesComplete) throw new Error('Incomplete changed-file set; area reconciliation withheld');
      }
    }
    const candidates=new Set([...comments.map(x=>x.user),...replies.map(x=>x.user),...timeline.map(x=>x.actor)].filter(x=>human(x,c.automationAccounts)).map(x=>x.login));
    const maintainers=[];
    for(const login of candidates) if(await this.maintainer(login)) maintainers.push(login);
    const fresh=await this.get(`/issues/${number}`);
    if(fresh.updated_at!==issue.updated_at||fresh.state!==issue.state) throw new Error('Issue changed while reading; rerun against fresh state');
    if(pr) {
      const freshPr=await this.get(`/pulls/${number}`);
      if(freshPr.head.sha!==pr.head.sha||freshPr.base.ref!==pr.base.ref||freshPr.base.sha!==pr.base.sha||freshPr.state!==pr.state) throw new Error('PR comparison changed while reading');
    }
    return {issue,pr,comments,timeline,replies,maintainers,files,filesComplete};
  }
  async completionIssues(pr) {
    const result=new Set(completionRefs(pr.body??'',this.repository));
    const commits=await this.pages(`/pulls/${pr.number}/commits`);
    if(commits.length!==pr.commits) throw new Error('Incomplete PR commit set; completion references cannot be guessed');
    for(const c of commits) for(const n of completionRefs(c.commit.message,this.repository)) result.add(n);
    const [owner,name]=this.repository.split('/'); let after=null;
    do {
      const {data}=await this.request('POST','/graphql',{
        query:`query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){closingIssuesReferences(first:100,after:$after){nodes{number repository{nameWithOwner}} pageInfo{hasNextPage endCursor}}}}}`,
        variables:{owner,name,number:pr.number,after}
      });
      if(data.errors?.length) throw new Error('GraphQL completion relationship lookup failed');
      const page=data.data?.repository?.pullRequest?.closingIssuesReferences;
      if(!page) throw new Error('Missing completion relationship evidence');
      for(const n of page.nodes) if(n.repository.nameWithOwner===this.repository) result.add(n.number);
      after=page.pageInfo.hasNextPage?page.pageInfo.endCursor:null;
      if(page.pageInfo.hasNextPage&&!after) throw new Error('Incomplete GraphQL pagination');
    } while(after);
    return [...result];
  }
  async contains(ancestor,descendant) {
    if(!/^[0-9a-f]{40}$/.test(ancestor)||!/^[0-9a-f]{40}$/.test(descendant)) throw new Error('Expected exact commit SHAs');
    const comparison=await this.get(`/compare/${ancestor}...${descendant}`);
    return ['ahead','identical'].includes(comparison.status);
  }
}
