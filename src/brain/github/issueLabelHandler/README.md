# Issue Label Handler

## Time to Triage

We track Time to Triage [as an SLO][looker] for EPD. The computation is
[defined in LookML][implementation] based on the `Waiting for: Product Owner` label. The
handler in this directory implements logic to manipulate the `Waiting for:
Product Owner` label in repos that are owned by one team (i.e., not `sentry`;
that's done with [a GitHub Action][action]). Here is the logic:

  1. Apply `Waiting for: Product Owner` to new issues from external users.

  2. Remove `Waiting for: Product Owner` when any other label is applied to the issue.

### How to resolve triage

To clear an issue from the triage queue, **add any label** to the GitHub issue
(e.g. a priority label, team label, or `Bug`). This triggers automatic removal
of `Waiting for: Product Owner`.

You can also remove `Waiting for: Product Owner` manually if you just want it
gone immediately.

> **Note:** Assigning yourself to the issue has no effect on the triage queue.
> The Slack triage reminders only check for the presence of the
> `Waiting for: Product Owner` label — assignees are not considered.

[looker]: https://sentryio.cloud.looker.com/explore/super_big_facts/github_issues_tttriage?qid=qhmtzKtcqK6uxmTYEWEZRx&toggle=dat,pik,vis
[implementation]: https://github.com/getsentry/lookml/blob/master/github_issues_tttriage.view.lkml
[action]: https://github.com/getsentry/sentry/blob/master/.github/workflows/issue-routing-helper.yml
