# Configuration and observable behavior

## Meaning

This is the runtime's configuration manual. It defines supported inputs, local overrides, observable transitions,
and where a repository must supply real facts. It does not decide the repository's product priorities or authorize
activation. All paths below are examples unless the adopting repository has selected them.

## One accepted policy, not an executable configuration

The standard path is `.github/automation/policy.json`. The policy, optional `.github/label-policy.json`, and referenced
message files are read through GitHub's API at one exact **current default-branch SHA**. The runtime refuses a stale
policy before writing. It never imports a fork's proposed configuration, code, or artifacts into that privileged run.

JSON is deliberate: native parsing, predictable types, and no runtime YAML dependency. Effective precedence is
**built-in defaults, explicitly selected profile, repository overrides**. Objects merge by key; arrays replace.
Boolean switches disable only their documented capability. Unknown fields and contradictory values fail visibly.
See [`schema/policy.schema.json`](../schema/policy.schema.json) for editor assistance and `configure()` for executable
validation. The label-language mapping is validated separately, including descriptions, scopes, colors, and writers.

The standard profile is `product`, for public **or private** product repositories. `company` disables ordinary Issue
expiry unless explicitly enabled; the complete company example also disables intake and response handling. It is for
selected internal workplace rooms, not a synonym for private visibility. It never infers Company authority.

| Input | Default / effect |
| --- | --- |
| `schemaVersion` | `1`; unsupported contracts fail |
| `labelPolicy` | `null`, or one repository-relative canonical label-policy file |
| `actor` | `wolfsblvt-automaton[bot]`; must match the authenticated App slug |
| `automationAccounts` | Extra exact account logins whose replies must not count as human activity |
| `inactivity` | Issues and PRs `true`, `afterDays: 90`, `warningDays: 7` for the product profile; Company leaves both off unless selected |
| `response` | Enabled; request after `14` days, warning grace `7` days |
| `reopen` | Enabled; phrase `still relevant` |
| `ownerCards` | Disabled; when enabled, exact maintainer owner-card headings can repair selected owner reminders |
| `branches` | `main: main`, `next: null`; selecting next requires a real HTTPS `tryNextUrl` |
| `labels` | Explicit key/name overrides when not contradicting the canonical mapping |
| `intake` | One-time Issue hints at opening; `needs.triage` by default, PR intake off |
| `areas` | Automatic PR area maps; ordinary Issue areas remain semantic judgments |
| `replies`, `resolutions` | Explicit maintainer-selection rules, empty until selected |
| `gate` | Disabled by default; optional main authorization and explicit hard blockers |
| `cleanup` | Remove owned Stale/Awaiting Response state on closure, never all labels |
| `messages` | Whole-message replacements, inline or `{ "file": ".github/automation/messages/name.md" }` |

`examples/label-policy.json` contains a normal code-repository type/Needs seed, the lifecycle controls, and six size
labels. Select real areas from the product rather than enabling every imaginable folder. The adoption example also selects standard Needs Testing, Information and Reproduction replies; replace or disable
those rules deliberately for the project. Review all definitions before provisioning them. Routine runs never create label definitions or delete existing definitions.

## Intake, classification, support, and disposition

Native Issue Forms can apply their initial type and triage hints. The engine can also select literal `titlePrefix`
rules during the opening event, for example:

```json
{
  "intake": {
    "issues": true,
    "prs": false,
    "labels": ["needs.triage"],
    "rules": [{ "titlePrefix": "[Bug]: ", "key": "type.bug" }]
  }
}
```

These are first-intake hints, not a permanent classifier. A later label removal is respected even if the opening event
is replayed. Historical maintenance does not invent a fresh opening event or overwrite a maintainer's corrected type.
Intake may project type/area/platform hints or initial triage; it cannot infer Approved, priority, or trust.

PR areas come from all changed-file pages, including old and new rename paths. They are independent of size exclusions.
This matcher supports case-sensitive `*`, `**`, and `?`, including root matches for `**/name`. Unsupported brace,
negation, bracket, or backslash dialects are refused rather than guessed. Give each automatic area one writer and an
explicit mapping. Removing a rule requires an explicit old-label migration, not automatic deletion of unknown labels.

A reply rule selects a mapped label and message. A resolution additionally selects `reason: completed` or
`not_planned`, optional `requiresReference: true`, and an optional explicitly adopted lock reason for moderation.
For example, after selecting the label definition and its actual meaning:

```json
{
  "labels": { "local.duplicate": "Duplicate" },
  "resolutions": {
    "local.duplicate": {
      "reason": "not_planned",
      "requiresReference": true,
      "message": "Closed in favor of {{reference}}. Please continue the discussion there."
    }
  }
}
```

The maintainer's preceding explanation must identify a different real Issue/PR in this repository. Ordinary timeout
closure stays unlocked. These transitions require an attributable label selection by a currently authorized maintainer;
a label name alone is not authority. An automatic execution of a manual disposition does not become a reopenable timeout.
Needs Testing and similar warnings remain advisory unless a separate exact hard-gate rule is selected.

## Owner-card reminders

An internal Company workplace may select `"ownerCards": { "enabled": true }` only after mapping
`owner.attention` and `owner.action-due` to its provisioned Issue labels and including both keys in `cleanup`. A current
comment from a configured maintainer then has one narrow deterministic repair path:

```markdown
**Owner action — Connect the account**
**Owner decision — Choose the source boundary**
**Owner co-design — React to the rendered label row**
```

Each current card declares exactly one kind: `Owner action`, `Owner decision`, or `Owner co-design`; a combined heading
is inert. Action and decision ensure both labels; co-design ensures Attention only. Before every add, the engine
re-reads the exact comment identity and body, current author permission, room state, and `Manual Triage` standing.
An edit, deletion, close, revoked permission, or new pause produces no stale add. An empty current delta is a converged
read-only result and does not mint the App writer. The engine ignores alert styling, prose, quoted text, fenced or
indented code, and `[Wolf]:` prefixes. It never removes a reminder from a later comment: the responsible coworker
disposes the exact card and removes its authored reminder. Enabling this projection requires both owner keys in the
close-cleanup set; close is the only automatic removal, and reopen preserves any current owner reminder.

## Timers and deliberate reopening

The ordinary activity anchor is the latest non-empty **non-bot reply**, including PR review discussion or a review body.
Creation/reopening starts an episode; label changes, reactions, commits, empty review-state changes, and Issue/body
edits do not reset its clock. Existing comments keep their original creation time when edited. Bots cannot keep work
alive by changing `updated_at`. Removing Stale only changes an annotation; the active warning still reaches its deadline.

A warning gets its full real grace from the App comment's creation time. Delayed or disabled schedules do not backdate
warnings or close immediately on reactivation. The warning stores its selected duration: an already-delivered 14-day
promise remains 14 days even when the current default becomes 7. Removing Keep Open re-evaluates the actual active
history; it does not manufacture activity or another automatic grace extension.

Keep Open alone exempts general inactivity. Confirmed, Approved, priority, adopted work, and Awaiting Release do not.
Product PR expiry is on by default with the same 90-day warning and 7-day grace as Issues. A repository may explicitly
disable it. The Company profile leaves both Issue and PR inactivity off unless it deliberately selects either journey.

To start a necessary-response workflow, a maintainer writes the essential question and adds this command in their reply:

```text
Please provide the reproduction steps for the current version.
/automaton await-response @reporter
```

Alternatively, deliberately applying Awaiting Response after that maintainer's question targets the Issue author.
This separate request survives label housekeeping. `/automaton cancel-response` in a maintainer reply cancels it.
The receiver's later reply stops the no-response consequence, not the need to assess whether it answered the question.
Other people's replies renew general interest but do not answer that particular request. Keep Open does not cancel it.

For an eligible automated timeout, a new non-bot post-closure reply containing **still relevant** requests reopening.
Anyone affected may use it, including after a no-response closure. Ask for an explanation without a word-count or model
quality gate. Matching is case-insensitive and whitespace-tolerant; quoted instructions, fenced/indented code and hidden
comments are inert. Editing an old pre-closure comment does not turn it into a new request.

Manual closure, a merged/locked PR, or maintainer discussion after the current warning prevents automatic reopening.
An old intervention in an earlier warning cycle is not a lifetime prohibition. Receipt/actor and exact close-event
identity are checked; an old timeout comment cannot overrule a later human closure. Provider refusal is returned,
not bypassed by restoring branches or manufacturing a replacement PR.

## Stable source, not distribution promises

A completed explicit relationship reaching `next` produces Awaiting Release and the actual testing instructions.
It does not close the Issue merely because development code landed. It also does not automatically grant Keep Open.

A completed relationship reaching **main always closes the Issue as fixed in stable source and supplies the factual
reply**, including single-line repositories and Issues already closed by GitHub itself. Packaging, deployment, and store
release are deliberately not prerequisites. The normal No Auto-reply control still suppresses narration when selected;
it does not redefine stable-source completion.

Completion links include native closing relationships and explicit closing verbs in PR/commit text. Unrelated mentions,
quoted examples, foreign-repository targets, and partial-scope references do not become closure instructions. Exact
commit containment is checked, including next-to-main integration. A main push can project an included next PR even if
its earlier reply was suppressed. Schedule recovery also examines recorded staged changes and merged PRs.

An explicit revert must reconcile its old completion relationship and desired Issue state. Commit ancestry alone cannot
prove that a change still exists after a semantic revert; do not leave an old staged receipt as the authoritative
completion relationship for a reverted feature. This implementation does not attempt semantic revert detection.

## Messages, controls, and independent writers

Replace a whole template, not just its greeting. File references also work in a reply/resolution rule's `message` value.
Values are nonrecursive data, not JavaScript or shell. Common variables are `kind`, `number`, `phrase`, `afterDays`,
`warningDays`, `deadline`, `keepOpenLabel`, `receiver`, `requestUrl`, `reference`, `main`, `branch`, `prUrl`, `commitSha`, and
`tryNextUrl`; availability depends on the actual transition. An unavailable variable fails the render before posting.

Machine episode markers are independent of editable prose. Do not remove them while changing message wording. A marker
is accepted only in the configured App's actual comment; a contributor quoting one supplies no state. Only the owned
message is edited, and replays do not produce routine duplicate notices.

Manual Triage pauses managed labels and policy replies, not tests or hard gates. No Auto-reply suppresses policy replies
without suppressing factual labels. A required warning that cannot be delivered is **blocked**, not secretly delivered;
there is no unannounced timeout closure. Main-source closure remains independently defined.

The product packet includes `.diffdevil.yml` and its repository-owned XL template for the managed **diffdevil** App.
Forgehand does not execute diffdevil, classify size, or write size labels or XL replies. Keep execution disabled while
the packet lands on stable `main`; after authorized App admission, the next ordinary pull request is the first truthful
trial because the App reads policy from the pull request base revision.

The managed App consumes the repository's accepted size policy, thresholds, exclusions, and completeness meaning. The
lifecycle engine does not reimplement measurement or compete for those keys.
