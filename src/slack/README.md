# Middleman Webhooks for Slack

Handlers in this folder can be sent messages to be sent to Sentry Slack channels.

Webhooks can be added to this directory with the name `custom-name` and will be served at `/slack/custom-name/webhook`.

To do so, create a directory at this level with the name `custom-name` containing an index.ts file that exports the webhook handler.
