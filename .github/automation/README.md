# Forgehand self-adoption

## Meaning

This is Forgehand's repository-owned product policy and message packet. It uses the public `v0.2.0` runtime recorded in [runtime-release.json](runtime-release.json). The reusable caller pins that release's exact commit in both coordinates. This source is a proposal until accepted on `main`; it does not enable a workflow, App, or lifecycle write.

The `product` profile supplies Issue and pull-request inactivity (90 days plus a delivered 7-day warning), explicit necessary-response waits (14 plus 7 days), deliberate reopening, and stable `main` completion. There is no development line, so `next` and its try route remain unset. Owner-card projection and the hard gate stay off. [policy.json](policy.json) adds the repository's message files and maintainer-selected replies and resolutions. The repository's [label policy](../label-policy.json) adds actual runtime, adoption, and documentation PR areas to the shared product labels.

## Writer and activation boundary

The existing `Runtime verification` workflow remains the test writer. Forgehand's caller in [`repository-automation.yml`](../workflows/repository-automation.yml) is disabled while repository variable `FORGEHAND_ENABLED` is absent. Its `issues: read` and `pull-requests: read` permissions do not make `GITHUB_TOKEN` a lifecycle writer. A later admitted Wolfsblvt Automaton App supplies only the bounded writer when the current plan has an effect.

The managed diffdevil App alone owns size labels, its check, and the once-per-transition XL reply from [`.diffdevil.yml`](../../.diffdevil.yml). Forgehand does not parse size, write those labels, or invoke a local diffdevil Action. The present GitHub stock labels remain untouched; selected policy definitions require separate provider provisioning. Unknown and existing labels are preserved.

Provider admission, App configuration, label provisioning, caller enablement, and publication of the [self-adoption Issue](self-adoption-issue.md) titled **Adopt Forgehand in its own repository** are later attributable effects. No history opt-in is implied. Use an ordinary real pull request for the first managed diffdevil result, and natural events for timer and closure evidence.

## Inspect and recover

From this checkout, `node src/cli.mjs config --config .github/automation/policy.json` validates the complete local packet and displays effective defaults. `node tools/install.mjs --runtime-release .github/automation/runtime-release.json --output .` previews the create-only source; customized local files are reported as `different-local-content` and are never overwritten. [Message authoring](../../docs/message-authoring.md) governs any voice change.

Once authorized provider effects enable operation, `FORGEHAND_ENABLED` is the caller stop control. A disabled caller leaves accepted source and prior GitHub state in place. Read-only `workflow_dispatch` with `apply: false` provides an inspection path; resume requires current App admission and an authorized enablement effect. A previously delivered warning retains its recorded period. An absent App writer never falls back to the workflow token.
