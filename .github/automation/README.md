# Forgehand self-adoption

## Meaning

This is Forgehand's repository-owned product policy and message packet. It uses the public `v0.2.0` runtime recorded in [runtime-release.json](runtime-release.json). The reusable caller pins that release's exact commit in both coordinates. This source is a proposal until accepted on `main`; it does not enable a workflow, App, or lifecycle write.

The `product` profile supplies Issue and pull-request inactivity (90 days plus a delivered 7-day warning), explicit necessary-response waits (14 plus 7 days), deliberate reopening, and stable `main` completion. There is no development line, so `next` and its try route remain unset. Owner-card projection and the hard gate stay off. [policy.json](policy.json) adds the repository's message files and maintainer-selected replies and resolutions. The repository's [label policy](../label-policy.json) adds actual runtime, adoption, and documentation PR areas to the shared product labels.

## Writer and activation boundary

The existing `Runtime verification` workflow remains the test writer. Forgehand's caller in [`repository-automation.yml`](../workflows/repository-automation.yml) is disabled while repository variable `FORGEHAND_ENABLED` is absent. Its `issues: read` and `pull-requests: read` permissions do not make `GITHUB_TOKEN` a lifecycle writer. A later admitted Wolfsblvt Automaton App supplies only the bounded writer when the current plan has an effect.

diffdevil alone owns size labels and the once-per-transition XL reply from [`.diffdevil.yml`](../../.diffdevil.yml). The Forgehand lifecycle engine does not parse size or write those labels. Until the managed diffdevil App can load the repository's XL template, Forgehand's own pull requests are sized by the diffdevil GitHub Action in [`diffdevil.yml`](../workflows/diffdevil.yml), pinned to `v1.0.0`, once it is enabled. That job reads `.diffdevil.yml` and its template from the pull request base with the workflow's read-only token, and writes only through a Wolfsblvt Automaton token limited to Issues and pull requests. It never checks out pull request code and only assigns the provisioned `📏 Size:` labels, never creating definitions. The managed App remains the destination and replaces the Action once its template path is qualified on a real pull request. Selected policy definitions require separate provider provisioning. Unknown and existing labels are preserved.

Exactly one host writes size labels and the XL reply. The Action job runs only while repository variable `DIFFDEVIL_ACTION_ENABLED` is `true`, so set it only after diffdevil App execution for this repository is suspended. Both hosts read the same `.diffdevil.yml`, so the labels and reply do not change with the writer. The Action's XL replies are authored by `wolfsblvt-automaton[bot]`, and the App's by `diffdevil[bot]`. The App does not recognize an earlier Action reply as its own, so it would repeat the reply on any pull request still over the XL threshold. Handing sizing to the App therefore needs one clear moment:

1. Read the open pull requests. If any is still XL and carries the Action's XL reply, hold: the Action stays the only writer until those episodes end, or the diffdevil estate supplies an exact reconciliation that keeps one visible reply. Do not delete a reply to pass this check.
2. Otherwise clear `DIFFDEVIL_ACTION_ENABLED`. That only stops later jobs; it does not cancel a job already running, and the concurrency group never cancels in progress. Read back that the variable is cleared and that every Action sizing run has reached a terminal state.
3. Read the open pull requests once more, since a run that was in flight may have created an XL episode. If none is active, resume App execution and read it back. If one is, set the variable back to `true` and hold as in step 1.

Provider admission, App configuration, label provisioning, caller and sizing enablement, and publication of the [self-adoption Issue](self-adoption-issue.md) titled **Adopt Forgehand in its own repository** are later attributable effects. No history opt-in is implied. Use an ordinary real pull request for the first Action sizing result and, later, the first managed diffdevil result. Use natural events for timer and closure evidence.

## Inspect and recover

From this checkout, `node src/cli.mjs config --config .github/automation/policy.json` validates the complete local packet and displays effective defaults. `node tools/install.mjs --runtime-release .github/automation/runtime-release.json --output .` previews the create-only source; customized local files are reported as `different-local-content` and are never overwritten. [Message authoring](../../docs/message-authoring.md) governs any voice change.

Once authorized provider effects enable operation, `FORGEHAND_ENABLED` is the caller stop control. A disabled caller leaves accepted source and prior GitHub state in place. Read-only `workflow_dispatch` with `apply: false` provides an inspection path; resume requires current App admission and an authorized enablement effect. A previously delivered warning retains its recorded period. An absent App writer never falls back to the workflow token. Clearing `DIFFDEVIL_ACTION_ENABLED` likewise stops later Action sizing jobs, leaves assigned size labels and replies in place, and does not cancel a job that is already running.
