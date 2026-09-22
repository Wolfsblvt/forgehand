import { human, ownText, wantsReopen, record, key } from './text.mjs';
import { glob } from './config.mjs';

export const DAY = 86_400_000;
const time = x => new Date(x).getTime();
const after = (a,b) => time(a) > time(b);
const latest = items => [...items].sort((a,b) => time(b.createdAt ?? b.created_at)-time(a.createdAt ?? a.created_at) || (b.id-a.id || 0))[0];

/** One coherent mutation boundary. Event payloads are hints; this consumes freshly read facts. */
export function plan(snapshot, c, now = new Date().toISOString()) {
  const { issue, pr, comments, timeline, replies = comments, maintainers = [] } = snapshot;
  const kind = pr ? 'pr' : 'issue';
  const labels = new Set(issue.labels.map(l => typeof l === 'string' ? l : l.name));
  const selectedScope = k => c.labelScopes === undefined || c.labelScopes[k]?.includes(kind);
  const has = k => selectedScope(k) && c.labels[k] && labels.has(c.labels[k]);
  const records = comments.map(x => record(x,c.actor)).filter(Boolean);
  const humans = replies.filter(x => human(x.user,c.automationAccounts) && x.body?.trim());
  const transitions = timeline.filter(e => ['closed','reopened'].includes(e.event));
  const lastTransition = latest(transitions);
  const epoch = latest(transitions.filter(e => e.event === 'reopened'));
  const epochAt = epoch?.created_at ?? issue.created_at;
  const epochId = epoch ? `reopened:${epoch.id}` : 'created';
  const recentReplies = humans.filter(x => time(x.created_at) >= time(epochAt));
  const lastReply = latest(recentReplies);
  const anchor = lastReply ? `${lastReply.source ?? 'comment'}:${lastReply.id}` : epochId;
  const activeAt = lastReply?.created_at ?? epochAt;
  const base = { kind, number:issue.number, now, afterDays:c.inactivity.afterDays, phrase:c.reopen.phrase, keepOpenLabel:c.labels['control.keep-open'] };
  const effect = (type, data) => ({type,...data});
  const message = (id, purpose, values={}, data={}) => effect('message',{id,purpose,values:{...base,...values},record:{version:1,id,kind:purpose,...data}});
  const add = k => selectedScope(k) && c.labels[k] && !has(k) ? effect('addLabel',{key:k,label:c.labels[k]}) : null;
  const remove = k => c.labels[k] && has(k) ? effect('removeLabel',{key:k,label:c.labels[k]}) : null;
  const suppress = has('control.manual-triage') || has('control.no-auto-reply');
  const manual = has('control.manual-triage');
  const find = id => records.find(r => r.id===id);
  const clean = keys => keys.map(remove).filter(Boolean);
  const warn = (mode, origin, values) => {
    const id=key('warning',mode,epochId,origin);
    const previous=find(id);
    if (!previous) {
      if (suppress) return [effect('blocked',{reason:'Warning cannot be delivered while policy replies are suppressed.'})];
      return [message(id,mode==='response'?'responseWarning':'staleWarning',{
        ...values, afterDays:c[mode==='response'?'response':'inactivity'].afterDays, deadline:new Date(time(now)+c[mode==='response'?'response':'inactivity'].warningDays*DAY).toISOString()
      },{mode,origin,epoch:epochId,afterDays:c[mode==='response'?'response':'inactivity'].afterDays,warningDays:c[mode==='response'?'response':'inactivity'].warningDays})];
    }
    const annotation = manual ? null : add('state.stale');
    if (annotation) return [annotation];
    // Stored warning time, not issue.updated_at and not a (removable) label timestamp.
    if (time(now) < time(previous.createdAt)+previous.warningDays*DAY) return [];
    if (suppress) return [effect('blocked',{reason:'Closure explanation is suppressed; the timeout cannot close silently.'})];
    const reopenEligible=c.reopen.enabled && !humans.some(x => maintainers.includes(x.user.login) && after(x.created_at,previous.createdAt));
    return [effect('timeout',{
      id:key('timeout',id), purpose:(mode==='response'?'responseClosed':'staleClosed') + (reopenEligible?'':'Manual'),
      values:{...base,...values,afterDays:previous.afterDays ?? base.afterDays,warningDays:previous.warningDays,deadline:new Date(time(previous.createdAt)+previous.warningDays*DAY).toISOString()}, mode, warningId:id, warningCommentId:previous.commentId,
      epoch:epochId, origin, warningAt:previous.createdAt,
      // Only actual discussion intervention changes custody; metadata edits do not.
      reopenEligible
    })];
  };

  if (issue.state === 'closed') {
    if (!manual) { const clear=clean(c.cleanup); if(clear.length) return clear; }
    if (pr?.merged || issue.locked || !c.reopen.enabled || suppress) return [];
    const receipt=latest(records.filter(r => r.kind==='timeout' && r.status==='closed'));
    if (!receipt || !receipt.reopenEligible || lastTransition?.event!=='closed' ||
        String(receipt.closeEventId)!==String(lastTransition.id) || lastTransition.actor?.login!==c.actor) return [];
    if (humans.some(x => maintainers.includes(x.user.login) && after(x.created_at,receipt.warningAt))) return [];
    const request=recentReplies.find(x => after(x.created_at,lastTransition.created_at) && wantsReopen(x.body,c.reopen.phrase));
    if (!request) return [];
    return [effect('reopen',{id:key('reopen',receipt.id,request.id),closeEventId:lastTransition.id,requestId:request.id,values:base})];
  }
  if (issue.locked) return [];

  // A response request is an explicit authored command, or a deliberate label after the author's actual question.
  const commands=comments.filter(x => human(x.user,c.automationAccounts) && maintainers.includes(x.user.login));
  const cancelled=latest(commands.filter(x => /^\/automaton cancel-response\s*$/mi.test(ownText(x.body))));
  const command=latest(commands.filter(x => /^\/automaton await-response @([\w-]+)\s*$/mi.test(ownText(x.body)) && time(x.created_at)>=time(epochAt)));
  let requestInput=command ? {comment:command,receiver:ownText(command.body).match(/^\/automaton await-response @([\w-]+)\s*$/mi)[1]} : null;
  const labelEvent=latest(timeline.filter(e => e.event==='labeled' && e.label?.name===c.labels['state.awaiting-response'] && maintainers.includes(e.actor?.login) && time(e.created_at)>=time(epochAt)));
  if (labelEvent && (!command || after(labelEvent.created_at,command.created_at))) {
    const question=latest(commands.filter(x => x.user.login===labelEvent.actor.login && time(x.created_at)<=time(labelEvent.created_at) && time(x.created_at)>=time(epochAt)));
    if (question) requestInput={comment:question,receiver:issue.user.login,labelEvent:labelEvent.id};
  }
  const requestId=requestInput && key('request',epochId,requestInput.comment.id,requestInput.labelEvent??'command');
  const requestRecord=latest(records.filter(r => r.kind==='responseRequest' && r.epoch===epochId));
  const request = requestRecord && (!requestInput || time(requestRecord.requestAt)>=time(requestInput.comment.created_at)) ? requestRecord : null;
  if (c.response.enabled && requestInput && !find(requestId) && (!cancelled || after(requestInput.comment.created_at,cancelled.created_at))) {
    if (suppress) return [effect('blocked',{reason:'Response request acknowledgement is suppressed.'})];
    return [message(requestId,'responseRequest',{receiver:requestInput.receiver,requestUrl:requestInput.comment.html_url},{epoch:epochId,receiver:requestInput.receiver,requestAt:requestInput.comment.created_at,requestUrl:requestInput.comment.html_url})];
  }
  if (c.response.enabled && request && (!cancelled || after(request.requestAt,cancelled.created_at))) {
    const answered=humans.some(x => x.user.login===request.receiver && after(x.created_at,request.requestAt));
    if (!answered) {
      if (!manual) { const a=add('state.awaiting-response'); if(a) return [a]; }
      if (time(now)>=time(request.requestAt)+c.response.afterDays*DAY) return warn('response',request.id,{receiver:request.receiver,requestUrl:request.requestUrl});
    } else if (!manual) { const clear=clean(['state.awaiting-response','state.stale']); if(clear.length) return clear; }
  } else if (cancelled && !manual) {
    const clear=clean(['state.awaiting-response']); if(clear.length) return clear;
  }

  // Trusted maintainer-selected disposition. A label is not sufficient without its attributable selection.
  if (!manual) for (const [k,r] of Object.entries(c.resolutions)) {
    if (!has(k)) continue;
    const selected=latest(timeline.filter(e => e.event==='labeled' && e.label?.name===c.labels[k] && maintainers.includes(e.actor?.login)));
    if (!selected || (epoch && time(selected.created_at) < time(epochAt))) continue;
    const explanation=latest(commands.filter(x => time(x.created_at)<=time(selected.created_at)));
    const reference=explanation?.body.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+|#\d+/)?.[0];
    if (r.requiresReference && !reference) return [effect('blocked',{reason:`${k} requires a recoverable replacement/duplicate reference in the maintainer explanation.`})];
    if (suppress) return [effect('blocked',{reason:'Resolution explanation is suppressed.'})];
    return [effect('resolve',{id:key('resolution',selected.id),purpose:`resolution:${k}`,values:{...base,reference:reference??'',requestUrl:explanation?.html_url??''},reason:r.reason,lock:r.lock})];
  }

  if (!manual) {
    for (const [k,r] of Object.entries(c.replies)) {
      if (!has(k)) continue;
      const selected=latest(timeline.filter(e => e.event==='labeled' && e.label?.name===c.labels[k] && maintainers.includes(e.actor?.login)));
      if (!selected) continue;
      const id=key('reply',k,selected.id);
      if (!find(id) && !suppress) return [message(id,`reply:${k}`,{}, {label:k,selection:selected.id})];
    }
    if (pr && snapshot.filesComplete) {
      const names=snapshot.files.flatMap(f => [f.filename,f.previous_filename].filter(Boolean));
      for (const a of c.areas) {
        const matches=names.some(n => a.include.some(p => glob(p).test(n)) && !(a.exclude??[]).some(p => glob(p).test(n)));
        const change=matches?add(a.key):remove(a.key);
        if(change) return [change];
      }
    }
  }
  const enabled=kind==='pr'?c.inactivity.prs:c.inactivity.issues;
  if (!enabled || has('control.keep-open')) return !manual?clean(['state.stale']):[];
  if (time(now)>=time(activeAt)+c.inactivity.afterDays*DAY) return warn('general',anchor,{});
  return !manual?clean(['state.stale']):[];
}

/** A stable-source completion is independent of packaging and store publication. */
export function completionPlan(issue, c, completion) {
  if ((completion.pr !== null && !Number.isSafeInteger(completion.pr)) || !/^[a-f0-9]{40}$/.test(completion.commit)) throw new Error('Incomplete completion evidence');
  if (![c.branches.main,c.branches.next].filter(Boolean).includes(completion.branch)) return null;
  return {
    type:completion.branch===c.branches.main?'fixed':'staged',
    id:key('completion',issue.number,completion.branch,completion.commit,completion.pr),
    ...completion
  };
}
