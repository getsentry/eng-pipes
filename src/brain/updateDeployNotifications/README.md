# updateDeployNotifications

Updates the notifications that are sent out by `pleaseDeployNotifier` when anyone deploys via Freight.

Freight gives us the range of `getsentry` commits that are being deployed. We can use those commit SHAs to find the Slack messages that `pleaseDeployNotifier` sent and update the messages accordingly. The message will be updated when a deploy is: queued, started, finished (successfully and not).

When a deploy is finished successfully, we also link the user to the corresponding Sentry Release page for both the `javascript` and `sentry` projects.
