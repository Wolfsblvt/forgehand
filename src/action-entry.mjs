import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execute } from './runner.mjs';

export async function runAction({env=process.env,executeRuntime=execute,logger=console}={}) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required');
    const mode = env.AUTOMATION_APPLY ?? 'false';
    if (!['true', 'false'].includes(mode)) throw new Error('apply must be true or false');
    const result = await executeRuntime({
      repository: env.GITHUB_REPOSITORY,
      policyPath: env.AUTOMATION_POLICY ?? '.github/automation/policy.json',
      event: JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')),
      eventName: env.GITHUB_EVENT_NAME,
      workflowRef: env.GITHUB_REF,
      apply: mode === 'true',
      readToken: env.AUTOMATION_READ_TOKEN,
      clientId: env.AUTOMATON_CLIENT_ID,
      privateKey: env.AUTOMATON_PRIVATE_KEY,
    });
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `requires-writer=${result.requiresWriter === true}\n`, 'utf8');
    logger.log(JSON.stringify(result, null, 2));
    if (env.GITHUB_STEP_SUMMARY) {
      await appendFile(env.GITHUB_STEP_SUMMARY,
        `## Repository automation\n\nMode: **${mode === 'true' ? 'apply' : 'read-only'}**. Result: **${result.status}**.\n\nPolicy SHA: \`${result.policySha ?? 'not used'}\`.\n`, 'utf8');
    }
    return {result,exitCode:result.status === 'partial-failure' ? 1 : 0};
  } catch (error) {
    logger.error(error.message);
    return {error,exitCode:1};
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = (await runAction()).exitCode;
}
