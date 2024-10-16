# Eng Pipes Development

## Development

Below are descriptions for how this application is organized. Each directory contains additional READMEs describing their functions in more detail. Those READMEs also describe how to contribute and edit code in the repo.

| directory | description                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`     | General APIs used across the app. These contain the APIs used for downstream channels.                                                                                                                        |
| `blocks`  | These are functions that return Slack block messages.                                                                                                                                                         |
| `brain`   | Brain contains event handlers for Slack, GoCD, and GitHub events. Slack uses the [bolt](https://slack.dev/bolt-js) framework, while GitHub just uses [@octokit/webhooks.js](https://github.com/octokit/webhooks.js). GoCD uses incoming HTTP webhook events and emits these events to its own event emitter (defined in `api/gocd/gocdEventEmitter.ts`)|
| `config`  | Configuration/constants                                                                                                                                                                                       |
| `types`   | Typescript types                                                                                                                                                                                              |
| `utils`   | Utility functions that do not interact with external APIs                                                                                                                                                     |
| `webhooks`| Webhook handlers for various services.                                                                                                                                                                        |
| `slack`   | Slack handlers for various services which send to specific Slack channels                                                                                                                                     |
| `jobs`    | Webhook endpoints for cron jobs that are triggered via Cloud Scheduler                                                                                                                                        |

`buildServer.ts` contains the server build logic, while `index.ts` is the entry point and initializes the server.

## Common Use Cases

## Generic Event Notifier

You can use this service to send a message to Sentry Slack or Datadog. All you have to do is create a small PR to create a HMAC secret for your use case, and your service can send messages to Sentry Slack and Datadog via infra-hub. See [this README](webhooks/README.md) for more details.

### Adding a New Webhook

To add a new webhook, nagivate to `webhooks` and follow the directions there. Most of the logic should be self-contained within the `webhooks` directory, with handlers in `brain` being appropriate if the webhook is for receiving event streams. To send a message to external sources, use the APIs in `api`.

### Adding a New Cron Job

To add a new running cron job, navigate to `jobs` and follow the directions there. Most of the logic should be self-contained there.

## Testing

Tests should live alongside the component it is testing and the filename must end with `.test.ts`.

## Migrations

We use [knex.js](http://knexjs.org/) and the `knex` CLI should be accessed via `yarn migrate`. e.g. to create a migration you would use

```shell
yarn migrate migrate:make <migration name>
```

You can run production migrations via GitHub's UI: <https://github.com/getsentry/eng-pipes/actions/workflows/migration.yml>

Click `Run workflow` and run with the default options.
