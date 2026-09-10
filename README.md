# 🔨 Forgehand

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node.js: 22+](https://img.shields.io/badge/Node.js-22%2B-green)](docs/maintenance.md)
[![Native ESM](https://img.shields.io/badge/runtime-native_ESM-slategray)](src/runner.mjs)

**Repository lifecycle, kept honest.**

Forgehand tends the mechanical work around GitHub Issues and pull requests for **Wolfsblvt Works**. One shared runtime
handles intake, activity clocks, necessary-response episodes, deliberate reopening, and stable-source completion; each
repository keeps its own policy, labels, and full message voice.

**Forgehand is the tool. Wolfsblvt Automaton is the actor.** Forgehand derives and applies bounded effects from current
repository facts and accepted policy; Automaton is the GitHub identity that performs those effects. Neither decides
product priority, acceptance, or whether a contribution is good.

No hosted service, model call, database, or runtime package installation is required.

> This repository is the public Forgehand runtime. Installation, required-check wiring, and live consumer
> qualification are separate steps. A source/test result does not mean Forgehand is already operating.

## Provenance

This initial public tree is the reviewed runtime subset transferred from private
[`Wolfsblvt/wolf-leitsatz`](https://github.com/Wolfsblvt/wolf-leitsatz) `main@18ced7c9bf948f81f4cbd266bf70e8f61823214e`,
at `payloads/github-automation`. It excludes Leitsatz doctrine, Company material, credentials, and private consumer
configuration. The first public GitHub release binds this source to Forgehand's immutable public repository and commit
coordinate; it does not activate a consumer workflow or publish an npm package.

## What it does

Initial intake hints and PR path areas; maintainer-selected support replies and resolutions; real inactivity and
necessary-response workflows; deliberate `still relevant` reopening; and concrete development/stable-source replies.
PR size labelling is unavailable in this first public release. It stays disabled until the separate DiffDevil dependency
is published and its install and invocation route is qualified. Forgehand does not contain another size parser.

The defaults are intentionally straightforward: Issues warn after **90 days without non-bot replies** and close after
**7 further days**. PR inactivity closure is available but **off by default**. Only replies reset the ordinary clock;
label edits, pushes, reactions, and body edits do not. **Keep Open** is its explicit exemption, not Confirmed or Approved.

A completed linked Issue is **closed and receives a reply when its fix reaches `main`**, even without a `next` branch.
That means fixed in stable source, not necessarily available in a package, deployment, or store. A fix on `next` is
marked **Awaiting Release** and points to the repository's actual way to use and test it.

## First useful result

With Node.js 22 or newer, this checkout needs no dependency installation:

```sh
npm test
npm run check
npm run build
node src/cli.mjs config --config examples/company-policy.json
```

The shipped policy example references its future repository-local label file. For a complete local configuration
preview, generate the create-only adoption packet first, then inspect it:

```sh
node tools/install.mjs --runtime-release <authoritative-public-release-record.json> --output artifacts/adoption --write
node src/cli.mjs config --root artifacts/adoption --config .github/automation/policy.json
```

The record comes from the authoritative public-runtime release result and binds its repository, exact SHA, and GitHub
release URL. The installer remains offline: without that record it produces only an explicitly
`public-runtime-unresolved` preview and refuses to create a caller. With it, the packet proves every generated workflow
coordinate matches the record; it does not perform a live availability check. Generation is **not live GitHub changes**.
Before activation, reconcile existing labels and writers, provision the selected label definitions through the authorized
setup route, and review the generated configuration. Do not overwrite an established label policy with the example.

Set up the selected App installation and mediated secret supply separately. The caller is inactive until that
repository's `FORGEHAND_ENABLED` variable is `true`. First dispatch it with `apply: false` and a concrete
Issue/PR number. The [configuration guide](docs/configuration.md) explains controls and templates; the
[maintenance guide](docs/maintenance.md) explains credentials, verification, updates, and recovery.

A reusable workflow is supplied in [`.github/workflows/automation.yml`](.github/workflows/automation.yml).
Repositories needing different composition can use [`action.yml`](action.yml) or the same CLI. These are entry points
into one runtime, not three separate implementations. Do not add a custom DiffDevil executable to that composition:
size labelling has no supported install or invocation route until DiffDevil is separately published and qualified.

## Scope and support

Forgehand is maintained as shared workflow infrastructure for **Wolfsblvt Works and Wolf's own projects**.
It is not currently developed as a general-purpose community platform, supported service, or compatibility commitment.
Third-party support, feature requests, and custom integrations may not receive a response; maintenance priorities are
set by those first-party projects.

You are welcome to use, modify, fork, and redistribute it under the **[MIT license](LICENSE)**. That permission does
not come with a promise to support your installation or expand the project for it. Forks need their own selected
configuration, App installation, enable flag, and credential supply. They do not inherit authorization to operate as
Wolfsblvt Automaton.

The public repository owns this implementation and its operating instructions. Company doctrine, rationale, private
project configuration, and internal work history are maintained separately.
