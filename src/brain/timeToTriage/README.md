# Time to Triage - Simple

We track Time to Triage [as an
SLO](https://sentryio.cloud.looker.com/explore/super_big_facts/github_issues_tttriage?qid=qhmtzKtcqK6uxmTYEWEZRx&toggle=dat,pik,vis)
for the Open Source Team and the EPD org as a whole, defined as the time from
routing an issue/PR created by an external user, to the time that the ticket is
either closed or accepted as valid (less any time spent waiting for the OP to
reply). The handler in this directory implements logic enabling us to compute
time to triage (which is done in Looker), using a `Status: Untriaged` label, in
repos that are owned by one team (i.e., not `sentry`; that's done with [a
GitHub
Action](https://github.com/getsentry/sentry/blob/master/.github/workflows/issue-routing-helper.yml)).
Here is the logic:

  1. Apply `Status: Untriaged` to new issues/PRs from external users.

  2. Remove `Status: Untriaged` when any label is applied to the issue.
