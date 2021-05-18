# Eng Pipes Development

## Development

Below are descriptions for how this application is organized.

| directory | description                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`     | General APIs used across the app                                                                                                                                                                              |
| `blocks`  | These are functions that return Slack block messages.                                                                                                                                                         |
| `brain`   | Brain contains event handlers for Slack and GitHub events. Slack uses the [bolt](https://slack.dev/bolt-js) framework, while GitHub just uses [@octokit/webhooks.js](https://github.com/octokit/webhooks.js). |
| `config`  | Configuration/constants                                                                                                                                                                                       |
| `types`   | Typescript types                                                                                                                                                                                              |
| `utils`   | Utility functions that do not interact with external APIs                                                                                                                                                     |
| `webhooks`| Webhook handlers for various services.                                                                                                                                                                        |

## Testing

Tests should live alongside the component it is testing and the filename must end with `.test.ts`.

## Migrations

We use [knex.js](http://knexjs.org/) and the `knex` CLI should be accessed via `yarn migrate`. e.g. to create a migration you would use

```shell
yarn migrate migrate:make <migration name>
```

You can run production migrations via GitHub's UI: <https://github.com/getsentry/eng-pipes/actions/workflows/migration.yml>

Click `Run workflow` and run with the default options.
