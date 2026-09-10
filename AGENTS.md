# Forgehand repository instructions

## Meaning

This repository owns Forgehand, the small reusable Wolfsblvt Works implementation for GitHub Issue/PR lifecycle
automation. It does not own Company doctrine, product prioritization, third-party support promises, or application
deployment.

## Durable branch declaration

`main` is the public implementation and release line. It is the GitHub default branch.

```text
main:
  maintainer integration: PR preferred
  external contributions: not currently accepted
  required pre-integration evidence: GitHub Actions Tests
  required approval/review: none
  resolved conversations: no
  automatic CI: GitHub Actions Tests
  automatic retained branch effects: none
  other pre-update evidence: none
```

Use Node.js 22 or newer. Run `npm test`, `npm run check`, and `npm run build` before proposing changes. Native ESM
and the standard library are intentional; no installation step or network dependency is needed to execute the engine.
Keep behavior, provider access, configuration, and messages separately understandable. Add behavioral tests at the
changed boundary. Tests must not call live GitHub or use actual secrets.

The runtime never executes contributor code. Accepted configuration is data read at one exact default-branch SHA.
Do not broaden credentials, replace whole label sets, add a size parser, or make packaging/store publication a
condition of stable-source Issue closure. `diffdevil` exclusively owns configured size labels and its own replies.

Only the public runtime files belong here. Keep internal doctrine, room histories, credentials, and private consumer
configuration outside this repository. A source PR is not permission to enable a consumer workflow, change an App,
merge, publish a release, or promise support. The owning maintainer chooses those effects.

Contributions use a reviewable PR. There is no automatically enabled
consumer lifecycle workflow in this repository merely because the reusable workflow file exists.
