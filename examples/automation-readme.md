# Repository automation packet

## Meaning

This create-only packet is the repository-owned Forgehand configuration. Review and adapt the selected profile, labels, and complete message files before any repository enables its caller.

The product profile includes `.diffdevil.yml` and the repository-authored XL message. The managed diffdevil App is its sole size-label, check, and XL-comment writer; Forgehand does not invoke a local diffdevil CLI. Keep App execution disabled until this policy and its templates are durable on stable `main`, then use the next ordinary pull request as the first honest trial.

The caller remains inactive until the repository explicitly selects its authorized enablement route. Generation creates files only: it does not provision labels, enable a workflow, admit the repository to an App, or publish a release.
