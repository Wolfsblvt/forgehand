#!/usr/bin/env node
import { readFile,writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { execute } from './runner.mjs';
import { localPolicy } from './local-policy.mjs';

const {values,positionals}=parseArgs({allowPositionals:true,options:{repository:{type:'string'},policy:{type:'string',default:'.github/automation/policy.json'},event:{type:'string'},'event-name':{type:'string'},apply:{type:'boolean',default:false},output:{type:'string'},config:{type:'string'},root:{type:'string'},help:{type:'boolean'}}});
try {
  let result;
  if(values.help) {
    console.log('Usage: node src/cli.mjs run --repository owner/repo --event event.json --event-name issues [--apply]\n       node src/cli.mjs config --config policy.json\nDefault is a read-only next-transition plan. Apply mints and revokes the exact repository App token.');
    process.exit(0);
  }
  if(positionals[0]==='config') {
    result=await localPolicy(values.config??values.policy,values.root);
  } else if(positionals[0]==='run') {
    const path=values.event??process.env.GITHUB_EVENT_PATH;
    if(!path) throw new Error('An event file is required');
    result=await execute({repository:values.repository??process.env.GITHUB_REPOSITORY,policyPath:values.policy,event:JSON.parse(await readFile(path,'utf8')),eventName:values['event-name']??process.env.GITHUB_EVENT_NAME,apply:values.apply,readToken:process.env.GH_TOKEN??process.env.GITHUB_TOKEN,clientId:process.env.AUTOMATON_CLIENT_ID,privateKey:process.env.AUTOMATON_PRIVATE_KEY});
  } else throw new Error('Expected run or config; use --help');
  const body=JSON.stringify(result,null,2)+'\n';
  if(values.output) await writeFile(resolve(values.output),body,'utf8');
  else console.log(body);
  if(result.status==='partial-failure') process.exitCode=1;
} catch(error) { console.error(error.message); process.exitCode=1; }
