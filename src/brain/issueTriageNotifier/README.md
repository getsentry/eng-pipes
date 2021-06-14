# issueTriageNotifier

Notifies team channels when they have a new issue [pending triage](https://open.sentry.io/triage/#3-triage).

This requires adding the `/notify-for-triage` command to the bot config.

`/notify-for-triage`: List all team label subscriptions
`/notify-for-triage <name>`: Subscribe to all untriaged issues for `Team: <name>` label
`/notify-for-triage -<name>`: Unsubscribe from untriaged issues for `Team: <name>` label