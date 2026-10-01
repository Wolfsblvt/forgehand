Forgehand now carries its own pinned caller, lifecycle policy, labels, messages, and DiffDevil size policy.

This issue is the public record for Forgehand's self-adoption. It was opened before the lifecycle was enabled; its first supported event afterwards exercises the repository's normal intake path through Wolfsblvt Automaton. Pull requests are sized now through the DiffDevil GitHub Action. Managed DiffDevil App sizing remains the destination and will replace the Action as the only size writer.

## Active behavior

- Issue and pull-request inactivity after 90 days without a non-bot reply, followed by a 7-day warning;
- explicit necessary-response requests with a 14-day period and 7-day warning;
- deliberate `still relevant` reopening after eligible timeout closures;
- maintainer-selected testing, information, reproduction and explanation replies;
- duplicate, not-planned and superseded resolutions;
- closure when an explicitly completed change reaches stable `main` source;
- repository-owned labels, areas and message voice; and
- pull-request size labels and the XL reply from the repository's `.diffdevil.yml`, applied by the DiffDevil GitHub Action as Wolfsblvt Automaton.

Owner-card projection and hard policy gates are not selected for this public product repository. Development-line staging remains off while Forgehand has only `main`.

## Still to come: managed DiffDevil App sizing

The managed DiffDevil App cannot yet load Forgehand's repository-owned XL reply template; it returns `E_TEMPLATE_SOURCE`. Until one ordinary pull request returns a successful managed check, the App does not size this repository. When it does, the Action is switched off first, so exactly one writer applies size labels and the XL reply.

## Qualification

The first lifecycle application must use the accepted policy and scoped Automaton actor, then read back the intended label and comment state. Repeated reconciliation must converge without duplicate effects. Disable and resume must preserve current repository state and previously delivered warning periods. The first ordinary pull request after Action sizing is enabled must receive one matching size label through the same actor.

Later inactivity, response, reopening, resolution and stable-source journeys qualify through natural repository use. Managed App sizing receives its own provider-path proof when the App defect is repaired. This issue is bootstrap evidence. The shared result is adoption in `wolf-leitsatz`, `emergency-meeting` and a customer-facing product.
