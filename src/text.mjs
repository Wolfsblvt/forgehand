import { createHash } from 'node:crypto';

/** Remove quoted/inert Markdown before interpreting a contributor's explicit command. */
export function ownText(body = '') {
  let fence = null;
  let quoted = false;
  return String(body).replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/).filter(line => {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      if (!fence) fence = {character:m[1][0],length:m[1].length};
      else if (m[1][0] === fence.character && m[1].length >= fence.length && !line.slice(m[0].length).trim()) fence = null;
      return false;
    }
    if (!line.trim()) quoted = false;
    else if (/^\s*>/.test(line)) quoted = true;
    return !fence && !quoted && !/^(?: {4}|\t)/.test(line);
  }).join('\n').replace(/`+[^`\n]*`+/g, '');
}

export function wantsReopen(body, phrase = 'still relevant') {
  const words = phrase.trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${words.join('\\s+')}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(ownText(body));
}

function ownerCardType(line) {
  return line.match(/^\s*(?:#{1,6}\s+|\*\*)Owner (action|decision|co-design)\b(?=\s*(?:—|:|-)|\*\*\s*(?:—|:|-|$))/i)?.[1]?.toLowerCase() ?? null;
}

function addOwnerCardLabels(labels, type) {
  if (!type) return;
  labels.add('owner.attention');
  if (type !== 'co-design') labels.add('owner.action-due');
}

/** Recognize only deliberate, current owner-card headings; prose, alerts, quotes, and code are inert. */
export function ownerCardLabels(body) {
  const labels = new Set();
  for (const line of ownText(body).split(/\r?\n/)) addOwnerCardLabels(labels, ownerCardType(line));
  const lines = String(body).replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/);
  let fence = null;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const opening = lines[index].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (opening) {
      if (!fence) fence = { character: opening[1][0], length: opening[1].length };
      else if (opening[1][0] === fence.character && opening[1].length >= fence.length && !lines[index].slice(opening[0].length).trim()) fence = null;
      continue;
    }
    if (fence || !/^>\s*\[!IMPORTANT\]\s*$/i.test(lines[index])) continue;
    const heading = lines[index + 1].match(/^>\s*(.*)$/)?.[1];
    addOwnerCardLabels(labels, ownerCardType(heading));
  }
  return [...labels];
}

/** Only explicit completion verbs; ordinary mentions and other repositories are not closure authority. */
export function completionRefs(body, repository) {
  const result = new Set();
  const ref = /(?:https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/|([\w.-]+\/[\w.-]+)?#)(\d+)/gy;
  const text = ownText(body);
  const verbs = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+/gi;
  for (const v of text.matchAll(verbs)) {
    let at = v.index + v[0].length;
    for (;;) {
      ref.lastIndex = at;
      const m = ref.exec(text);
      if (!m) break;
      const targetRepo = m[1] ?? m[2] ?? repository;
      if (targetRepo.toLowerCase() === repository.toLowerCase()) result.add(Number(m[3]));
      at = ref.lastIndex;
      const separator = text.slice(at).match(/^\s*(?:,\s*(?:and\s+)?|and\s+)/i);
      if (!separator) break;
      at += separator[0].length;
    }
  }
  return [...result].filter(Number.isSafeInteger).filter(n => n > 0);
}

export function key(...parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
}

export function human(user, excluded = []) {
  return user?.type === 'User' && !excluded.includes(user.login) && !user.login.endsWith('[bot]');
}

export function marker(data) {
  return `<!-- forgehand:v1:${Buffer.from(JSON.stringify(data)).toString('base64url')} -->`;
}

/** A marker is state only in the configured App's actual comment, never in a quotation by a user. */
export function record(comment, actor) {
  if (comment.user?.type !== 'Bot' || comment.user.login !== actor) return null;
  const matches = [...String(comment.body).matchAll(/^<!-- forgehand:v1:([\w-]+) -->$/gm)];
  if (matches.length !== 1) return null;
  try {
    const value = JSON.parse(Buffer.from(matches[0][1], 'base64url').toString('utf8'));
    if (value.version !== 1 || typeof value.id !== 'string' || typeof value.kind !== 'string') return null;
    return { ...value, commentId: comment.id, createdAt: comment.created_at, body: comment.body };
  } catch { return null; }
}

export function render(template, values) {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Unknown message variable: ${name}`);
    // Values are plain text/known URLs, never recursive templates or workflow commands.
    return String(values[name]);
  });
}
