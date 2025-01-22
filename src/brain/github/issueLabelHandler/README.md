# Issue Label Handler

## Time to Triage

We track Time to Triage [as an SLO][looker] for EPD. The computation is
[defined in LookML][implementation] based on the `Status: Untriaged` label. The
handler in this directory implements logic to manipulate the `Status:
Untriaged` label in repos that are owned by one team (i.e., not `sentry`;
that's done with [a GitHub Action][action]). Here is the logic:

  1. Apply `Status: Untriaged` to new issues/PRs from external users.

  2. Remove `Status: Untriaged` when any other label is applied to the issue.

[looker]: https://sentryio.cloud.looker.com/explore/super_big_facts/github_issues_tttriage?qid=qhmtzKtcqK6uxmTYEWEZRx&toggle=dat,pik,vis
[implementation]: https://github.com/getsentry/lookml/blob/master/github_issues_tttriage.view.lkml
[action]: https://github.com/getsentry/sentry/blob/master/.github/workflows/issue-routing-helper.yml
