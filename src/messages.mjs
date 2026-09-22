export const messages = {
  staleWarning: 'There have been no new replies for {{afterDays}} days.\n\nReply by {{deadline}} if this {{kind}} still needs attention. Without a reply, it will close automatically.',
  staleClosed: 'Closed after the inactivity warning expired.\n\nThis does not mean the report was fixed or rejected. To request reopening, reply with a brief reason and include **{{phrase}}**.',
  staleClosedManual: 'Closed after the inactivity warning expired.\n\nAutomatic reopening is not available for this closure. A maintainer must reopen it.',
  responseClosedManual: 'Closed because the question in {{requestUrl}} received no response before the deadline.\n\nAutomatic reopening is not available for this closure. A maintainer must reopen it.',
  responseRequest: 'A response is needed from @{{receiver}} to the question in {{requestUrl}}.',
  responseWarning: '@{{receiver}}, the question in {{requestUrl}} still needs a response.\n\nWithout one by {{deadline}}, this {{kind}} will close automatically.',
  responseClosed: 'Closed because the question in {{requestUrl}} received no response before the deadline.\n\nTo request reopening, reply with the requested information or a brief reason and include **{{phrase}}**.',
  reopened: 'Reopened after an explicit **{{phrase}}** request.\n\nThis returns the {{kind}} to triage. It does not approve the request or confirm that missing information is complete.',
  awaitingRelease: 'The change for this issue is available on **{{branch}}** in {{prUrl}}.\n\nIt is not in stable **{{main}}** yet. To try it: {{tryNextUrl}}',
  fixedMain: 'The change for this issue is now in stable **{{main}}** source: {{prUrl}} ({{commitSha}}).\n\nThis issue is closed as fixed in source. A package or deployment may follow later.',
  closeAborted: 'Automatic closure was cancelled because the discussion or policy changed before it could be applied.'
};
