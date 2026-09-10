import { configure } from '../src/config.mjs';
import { record } from '../src/text.mjs';
export const actor={login:'wolfsblvt-automaton[bot]',type:'Bot'};
export const reporter={login:'reporter',type:'User'};
export const maintainer={login:'Wolf',type:'User'};
export const date=day=>new Date(Date.UTC(2026,0,1)+day*86400000).toISOString();
export function fixture({pr=false,overrides={},age=100}={}) {
  const c=configure(overrides);
  const s={
    issue:{number:7,created_at:date(0),updated_at:date(0),state:'open',locked:false,labels:[],user:reporter,...(pr?{pull_request:{url:'url'}}:{})},
    pr:pr?{number:7,state:'open',merged:false,head:{sha:'a'.repeat(40),ref:'fix/example',repo:{full_name:'outside/repo'}},base:{sha:'b'.repeat(40),ref:'main',repo:{full_name:'Wolf/project'}},changed_files:0,commits:0}:null,
    comments:[],timeline:[],files:[],filesComplete:true,maintainers:['Wolf'],replies:[]
  };
  let next=1;
  const clock={day:age,now:()=>date(clock.day)};
  const comment=(body,user=reporter,day=clock.day)=>{
    const x={id:next++,body,user,created_at:date(day),updated_at:date(day),html_url:`https://github.com/Wolf/project/issues/7#issuecomment-${next}`,issue_url:'https://api.github.com/repos/Wolf/project/issues/7'};
    s.comments.push(x); return x;
  };
  const label=(name,user=maintainer,day=clock.day)=>{s.issue.labels.push({name});s.timeline.push({id:next++,event:'labeled',label:{name},actor:user,created_at:date(day)});};
  const state=(value,user=maintainer,day=clock.day)=>{
    s.issue.state=value; if(s.pr)s.pr.state=value;
    s.timeline.push({id:next++,event:value==='closed'?'closed':'reopened',actor:user,created_at:date(day)});
  };
  const gh={
    repository:'Wolf/project',root:'/repos/Wolf/project',writeToken:'fixture-only',writes:[],
    async ref(){return 'b'.repeat(40);},
    async contains(){return true;},
    async maintainer(login){return s.maintainers.includes(login);},
    async snapshot(){return structuredClone({...s,replies:[...s.comments,...s.replies]});},
    async pages(path){
      if(path==='/labels')return Object.values(c.labels).map(name=>({name}));
      if(path.includes('/comments'))return structuredClone(s.comments);
      if(path.includes('/timeline'))return structuredClone(s.timeline);
      if(path==='/pulls?state=open')return s.pr?[s.pr]:[];
      throw new Error('Unexpected pages '+path);
    },
    async get(path){
      if(path==='/issues/7')return structuredClone(s.issue);
      if(path==='/pulls/7')return structuredClone(s.pr);
      if(path.startsWith('/issues/comments/'))return structuredClone(s.comments.find(x=>x.id===Number(path.split('/').at(-1))));
      if(path==='/issues/8')return {number:8,state:'open'};
      throw new Error('Unexpected get '+path);
    },
    async write(method,path,body){
      this.writes.push({method,path,body:structuredClone(body)});
      if(method==='POST'&&path==='/issues/7/comments')return structuredClone(comment(body.body,actor));
      if(method==='PATCH'&&path.startsWith('/issues/comments/')) {const x=s.comments.find(x=>x.id===Number(path.split('/').at(-1)));x.body=body.body;return structuredClone(x);}
      if(method==='POST'&&path==='/issues/7/labels'){for(const n of body.labels)if(!s.issue.labels.some(x=>x.name===n))label(n,actor);return structuredClone(s.issue.labels);}
      if(method==='DELETE'&&path.startsWith('/issues/7/labels/')){s.issue.labels=s.issue.labels.filter(x=>x.name!==decodeURIComponent(path.split('/').at(-1)));return null;}
      if(method==='PATCH'&&['/issues/7','/pulls/7'].includes(path)){state(body.state,actor);s.issue.state_reason=body.state_reason;return structuredClone(s.issue);}
      if(method==='PUT'&&path==='/issues/7/lock'){s.issue.locked=true;return null;}
      throw new Error('Unexpected write '+method+' '+path);
    }
  };
  return {c,s,clock,gh,comment,label,state,records:()=>s.comments.map(x=>record(x,c.actor)).filter(Boolean)};
}
