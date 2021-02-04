# Required Checks

Notifies Slack when `getsentry` master is red.

This listens to `check_run` events and only looks at the `getsentry required checks` Check Run ([see workflow](https://github.com/getsentry/getsentry/blob/master/.github/workflows/required-checks.yml))
