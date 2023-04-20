# issueNotifier

Notifies product owner channels when they have a new issue [pending
triage](https://open.sentry.io/triage/#3-triage). This also notifies the
support channel when a new issue comes in that is unrouted.

This requires adding the `/notify-for-triage` command to the bot config.

- `/notify-for-triage`: List all product area label subscriptions
- `/notify-for-triage <name> <office>`: Subscribe to all untriaged issues for `Product Area: <name>` label in an office location (sfo, sea, yyz, vie, ams).
- `/notify-for-triage -<name> <office>`: Unsubscribe from untriaged issues for `Product Area: <name>` label in an office location (sfo, sea, yyz, vie, ams).
