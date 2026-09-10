import { readFile, appendFile } from 'node:fs/promises';
import { execute } from './runner.mjs';

try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required');
  const mode = process.env.AUTOMATION_APPLY ?? 'false';
  if (!['true', 'false'].includes(mode)) throw new Error('apply must be true or false');
  const result = await execute({
    repository: process.env.GITHUB_REPOSITORY,
    policyPath: process.env.AUTOMATION_POLICY ?? '.github/automation/policy.json',
    event: JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')),
    eventName: process.env.GITHUB_EVENT_NAME,
    apply: mode === 'true',
    readToken: process.env.AUTOMATION_READ_TOKEN,
    clientId: process.env.AUTOMATON_CLIENT_ID,
    privateKey: process.env.AUTOMATON_PRIVATE_KEY,
  });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `requires-writer=${result.requiresWriter === true}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## Repository automation\n\nMode: **${mode === 'true' ? 'apply' : 'read-only'}**. Result: **${result.status}**.\n\nPolicy SHA: \`${result.policySha ?? 'not used'}\`.\n`, 'utf8');
  }
  if (result.status === 'partial-failure') process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
