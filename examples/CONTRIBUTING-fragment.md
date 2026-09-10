## Automated issue and pull-request handling

Labels help us triage work; Confirmed or Approved is not a delivery commitment. Ordinary issues receive an inactivity
warning after 90 days without non-bot replies, then close after a further 7 days without a reply. Label edits, reactions,
pushes, and body edits do not reset that clock. Maintainers can use **Keep Open** to exempt an issue from general inactivity.

General pull-request expiry is **disabled** in this example. Maintainers should strongly consider enabling it when
regular outside contributions create a standing submission queue, and update this paragraph to the actual adopted rule.
An explicitly requested essential response has its own shorter policy; Keep Open does not cancel that request.

An issue or PR closed by an eligible automated timeout can be reopened by a non-bot reply explaining why it still matters
and containing **still relevant**. Quoting the instructions alone is not a request. Manual closures and subsequent
maintainer intervention require manual reopening. Reopening is renewed triage, not implementation approval.

A fix merged into `main` closes its linked issue as fixed in stable source. Packaged releases, deployments, and store
updates may follow later. When this project uses `next`, the automation points to the actual way to test that branch.
