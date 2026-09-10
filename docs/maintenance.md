# Operation, updates, and qualification

## Meaning

This guide carries the public runtime's installation, credential, test, update, and failure boundaries. It is not a
service agreement or a substitute for the owning repository's approval and effect authority.

## Installation and updates

Adopt the generated caller on the repository's default branch after selecting the local policy, definitions, and existing
writer replacement. One repository-scoped `FORGEHAND_ENABLED=true` variable enables this caller; the App must
also actually be installed with the selected permissions. Source files and a flag do not create that installation.

The reusable workflow and its runtime checkout use the **same reviewed exact commit pin** emitted by `tools/install.mjs`.
No moving `main` dependency silently updates dozens of projects. The installer stays offline: it accepts an authoritative
public-runtime release record with `schemaVersion`, `repository`, `runtimeRef`, and the matching GitHub `releaseUrl`, then
proves that all generated workflow coordinates match that record. It does not look the SHA up or claim that a
private/local commit is public. Without that record it emits only `public-runtime-unresolved` preview evidence and refuses
to create a caller. The public name suggested by this seed is `Wolfsblvt/forgehand`; forks can supply
another public runtime repository. Public callers cannot consume a private reusable workflow.

The installer previews by default and creates only missing files when `--write` is supplied. It refuses to overwrite
different local policy or workflow contents. On upgrade, review the new runtime pin and its configuration changes, update
both workflow coordinates, preserve local policy and branded templates, and preview representative transitions. It is a
small source upgrade, not a fleet controller or a regeneration of all project choices.

Existing default-branch checks and release workflows remain independent. The shared runtime observes stable-source
integration; it never merges, publishes, deploys, changes repository settings, or deletes contributor branches.

## Token and trusted-code boundary

The ordinary workflow token has only Contents/Issues/PR **read** permissions. API reads, accepted policy loading, and the
current read-only plan do not require a personal write token or the App private-key route. Only a non-empty current plan
enters apply mode, verifies the selected App identity, and mints a short-lived installation token for **exactly the
current repository**. It requests Contents read, Issues write, and PRs write. Checks write is requested only when the
optional actual policy-check implementation is selected. No Contents write, Actions write, administration,
collective-agent credential, or automatic user-token fallback is used.

Supply `WOLFSBLVT_AUTOMATON_CLIENT_ID` as the selected variable and `WOLFSBLVT_AUTOMATON_PRIVATE_KEY` through the approved
secret route. Raw keys/tokens must never appear in source, arguments, logs, screenshots, or handoff files. The key is
used only inside the final trusted process, not sent to diffdevil. The token is revoked on normal completion and
ordinary error. If the process is killed before cleanup, use GitHub's token expiration/revocation behavior; do not
mistake a killed process for proved revocation. Unexpectedly broad minted tokens are refused and revoked.

The supported metadata workflow never checks out the caller's PR or executes its code. It checks out only the selected
public runtime at an exact SHA. Consumer policy/templates are fetched as data from an exact default-branch SHA and are
rechecked before effects. Self-tests run separately on `pull_request` without App secrets. Caches and untrusted workflow
artifacts are not a transport into the privileged job.

The supplied workflow supports GitHub.com and hosted Ubuntu. The Node library/CLI uses native ESM on Node 22+; another
runner or GHES is a separately qualified composition, not an implicitly supported host. The official Actions pins in
this candidate were read on 2026-09-09: checkout v7.0.1 at `3d3c42e5aac5ba805825da76410c181273ba90b1` and setup-node v6.5.0
at `249970729cb0ef3589644e2896645e5dc5ba9c38`. Revalidate their contracts when upgrading.

## Real gates, not colored decorations

The optional gate writes a named Check Run on the actual PR head, with the App as the provider actor. `protectMain`
requires an explicitly authorized stable exception or same-repository `next` release PR; a fork branch merely called
next is not sufficient. `blockingLabels` are separate deliberate hard controls, not automatic conversion of Needs
Testing or every warning into a barrier.

Checks attach to commits, not individual PRs. The check therefore considers all open PRs sharing that head, so a
simultaneous unqualified main-target PR cannot borrow a green result from another PR. Retargeting, label changes,
reopening, closure, and source updates refresh the result. A closed peer no longer supplies a violation.

The runtime does **not** configure rulesets or required checks. An adopter who claims enforcement must require this
exact App-owned check on the actual protected transition and exercise a refused and an accepted case. A green check
is policy evidence, never semantic approval or permission to merge. Until that provider qualification occurs, the
implementation exists but the hard gate is not claimed enforced.

## Evidence and test commands

```sh
npm test
npm run check
npm run build
node tools/install.mjs --runtime-release <authoritative-public-release-record.json>
```

`npm test` uses the native Node runner and in-memory provider fixtures. It exercises real transition code, rendering,
provider boundaries, pagination, authentication requests, and fault recovery, not a live account. `check` validates
syntax and complete supplied policy/definition examples. `build` copies an allowlisted public file set and creates
`artifacts/package/MANIFEST.json` with SHA-256s. It performs no network or publication. `--output <path>` selects another
explicit build-output directory, useful while the seed is reviewed inside a private parent repository.

A private source proposal may carry these tests before public publication. Hosted Actions parsing/execution, consumer
App custody, full caller integration, fork operation, real required-check behavior, and deployed Skill discovery are
separate evidence. They must be named unobserved until exercised. Inspect the actual labels, comments, close reason,
head Check Run, and lack of duplicate effects on a representative live consumer before calling the workflow operating.

## Recovery and limits

The event is a hint. Reconciliation rereads the object, relevant history, controls, and policy rather than applying an
old label array. Repository-local workflow serialization prevents the kit's own concurrent writers; it is not an atomic
transaction with human edits or a durable GitHub event queue. Scheduling and explicit dispatch repair missed ordinary
state, timer, and merge events. There is no cross-repository sweep.

The scheduled recovery path reads complete repository metadata, including closed timeout/merge history, so a missed
reopening or merge is not silently discarded by an arbitrary lookback window. That has API/runtime cost on a large
repository. Provider rate limits or incomplete data fail visibly; do not substitute partial history and call it current.
This first-party implementation does not yet have a persisted maintenance cursor or claim large-estate throughput.

Labels are added and removed individually. Missing definitions are a setup failure, not an excuse to create names from
contributor text. An ambiguous comment POST is rediscovered by its actual App-owned marker before another attempt.
An attributable close whose response was lost can finalize its unique pending receipt; an intervening human transition
prevents that inference. A provider-refused reopen remains closed and is returned as a failure.

Required warning suppression, a changed policy/head, stale completion evidence, rate limiting, unavailable endpoints,
and missing credentials produce actionable blocked/failure results. Other independent subjects may finish, but the run
is non-green when a selected effect failed. There is no silent downgrade to a broad token or another writer.

A finalized completion receipt prevents old events from repeatedly closing an Issue that was later manually reopened.
Historic recovery without that proof does not override a later human reopening. If an operator deliberately removes
machine receipts, suppresses all replies, rewrites integration history, or reverts a change, reconcile the affected
source/Issue relationship explicitly. Do not describe ancestry as semantic proof that a reverted fix remains present.

To disable this consumer, unset its enable flag or remove the selected caller; revoke an exposed credential immediately.
Neither operation deletes Issue history, rewrites Git, or stops unrelated build/deployment jobs. Resume through a dry-run
and current-state reconciliation. Already-delivered warning periods remain recoverable in their own receipts.
