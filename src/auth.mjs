import { createSign } from 'node:crypto';

/** Mint only the current repository's selected installation token. Nothing uses the collective agent account. */
export async function appToken({repository,clientId,privateKey,expectedSlug,checks=false,fetcher=fetch,now=Date.now()}) {
  if(!clientId||!privateKey) throw new Error('AUTOMATON_CLIENT_ID and AUTOMATON_PRIVATE_KEY are required for apply');
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const payload=`${encode({alg:'RS256',typ:'JWT'})}.${encode({iat:Math.floor(now/1000)-60,exp:Math.floor(now/1000)+540,iss:clientId})}`;
  const signer=createSign('RSA-SHA256'); signer.update(payload);
  const jwt=`${payload}.${signer.sign(privateKey,'base64url')}`;
  const request=async(method,path,body)=>{
    const r=await fetcher(`https://api.github.com${path}`,{method,redirect:'error',headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${jwt}`},...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok) throw new Error(`App authentication ${method} ${path} returned ${r.status}`);
    return r.json();
  };
  const app=await request('GET','/app');
  if(app.slug!==expectedSlug) throw new Error('The credential belongs to a different GitHub App');
  const installation=await request('GET',`/repos/${repository}/installation`);
  if(installation.app_id!==app.id) throw new Error('App installation mismatch');
  const permissions={contents:'read',issues:'write',pull_requests:'write',...(checks?{checks:'write'}:{})};
  const token=await request('POST',`/app/installations/${installation.id}/access_tokens`,{repositories:[repository.split('/')[1]],permissions});
  const refuse=async(message)=>{
    if(token.token) {
      const revoked=await fetcher('https://api.github.com/installation/token',{method:'DELETE',redirect:'error',headers:{Authorization:`Bearer ${token.token}`,Accept:'application/vnd.github+json'}});
      if(!revoked.ok) throw new Error(`${message}; revocation returned ${revoked.status}, revoke the unexpected installation token before retrying`);
    }
    throw new Error(message);
  };
  if(!token.token||token.repositories?.length!==1||token.repositories[0].full_name!==repository) return refuse('Installation token is not scoped to exactly this repository');
  const wanted=new Set([...Object.keys(permissions),'metadata']);
  if(Object.keys(token.permissions??{}).some(k=>!wanted.has(k)) || Object.entries(permissions).some(([k,v])=>token.permissions[k]!==v)) return refuse('Unexpected installation-token permissions');
  return {token:token.token,slug:app.slug,appId:app.id};
}
