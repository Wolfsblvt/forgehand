Forgehand now carries its own pinned caller, lifecycle policy, labels, messages, and DiffDevil size policy.

This issue is the public record for Forgehand's self-adoption. It was opened before the lifecycle was enabled; its first supported event afterwards exercises the repository's normal intake path through Wolfsblvt Automaton. Pull-request sizing through the DiffDevil GitHub Action is the next step. Managed DiffDevil App sizing remains the destination and will replace the Action as the only size writer.

## Active lifecycle behavior

- Issue and pull-request inactivity after 90 days without a non-bot reply, followed by a 7-day warning;
- explicit necessary-response requests with a 14-day period and 7-day warning;
- deliberate `still relevant` reopening after eligible timeout closures;
- maintainer-selected testing, information, reproduction and explanation replies;
- duplicate, not-planned and superseded resolutions;
- closure when an explicitly completed change reaches stable `main` source; and
- repository-owned labels, areas and message voice.

Owner-card projection and hard policy gates are not selected for this public product repository. Development-line staging remains off while Forgehand has only `main`.

## Still to come: pull-request sizing

Pull requests do not receive size labels or the XL reply yet. The DiffDevil GitHub Action will apply them next from the repository's `.diffdevil.yml`, as Wolfsblvt Automaton. The managed DiffDevil App cannot yet load Forgehand's repository-owned XL reply template; it returns `E_TEMPLATE_SOURCE`. Once one ordinary pull request returns a successful managed check, the App replaces the Action. The handover waits until no open pull request is still over the XL threshold with the Action's reply, so no one is told twice. It then switches the Action off and confirms its running jobs have finished before the App starts, so exactly one writer applies size labels and the XL reply.

## Qualification

The first lifecycle application must use the accepted policy and scoped Automaton actor, then read back the intended label and comment state. Repeated reconciliation must converge without duplicate effects. Disable and resume must preserve current repository state and previously delivered warning periods.

Later inactivity, response, reopening, resolution and stable-source journeys qualify through natural repository use. Each sizing writer receives its own proof on an ordinary pull request. This issue is bootstrap evidence. The shared result is adoption in `wolf-leitsatz`, `emergency-meeting` and a customer-facing product.
