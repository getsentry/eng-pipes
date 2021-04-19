# sentry-ci-tooling

This repo allows us to provide automation across developer tools used in [sentry](https://github.com/getsentry/sentry) and [getsentry](https://github.com/getsentry/sentry) development, as well as collecting and aggregating tooling metrics (e.g. GitHub, Freight).
There is also Slack integration to provide tools through Slack.

Read the README in the `src/` directory for information on the code structure.

## Pre-requisites

- [direnv](https://direnv.net/)
- [Docker](https://www.docker.com/)
- [Yarn](https://yarnpkg.com)

## Architecture

The services that this app is configured for, send metrics to the Sentry CI Tooling app. This app stores the data in Google's BigQuery.
A Looker dashboard (here's an [example]) shows the data it fetches from BigQuery.

The app can also determine that it needs to send a message to the Slack workspace.

[example]: https://sentryio.cloud.looker.com/dashboards/226

![Diagram representing the production](docs/production.svg 'Production diagram')

TODO: Add notes for the following:

- What code does a service need to call to report to this app?
- How do you build a Looker dashboard?

## Development & tests

Follow the steps in the next section before running these steps:

```sh
# Start local postgres
docker run --rm --name ci-tooling-postgres -e POSTGRES_PASSWORD=docker -d -p 127.0.0.1:5434:5432 postgres:12
# Install dependencies
yarn install
# Start dev (it won't work until you set up the variables in .env file)
yarn dev
```

Running tests:

```sh
# Testing
yarn test
```

## Setup

`direnv` will create `.env` for you if you don't have one. Follow the instructions below and adjust the variables in the `.env` file

### Setup Secrets

The following secrets are configured in GitHub for this app to function and to deploy to Google.
You can grab GitHub and Slack secrets in their respective configuration pages: [GitHub App](https://github.com/organizations/getsentry/settings/apps/sentry-internal-tools) and the [Slack App](https://api.slack.com/apps/ASUD2NK2S/general?)

You will also need to set up some of these environment variables if you want to test this locally, e.g. using `direnv` or something similar

- `GH_APP_IDENTIFIER` - GitHub App identifier
- `GH_APP_SECRET_KEY` - GitHub App private key
- `GH_WEBHOOK_SECRET` - GitHub webhook secret to confirm that webhooks come from GitHub
- `SENTRY_WEBPACK_WEBHOOK_SECRET` - Webhook secret that needs to match secret from CI. Records webpack asset sizes.
- `SLACK_SIGNING_SECRET` - Slack webhook secret to verify payload
- `SLACK_BOT_USER_ACCESS_TOKEN` - The Slack Bot User OAuth Access Token from the `Oauth & Permissions` section of your Slack app

Optional database configuration

- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name
- `DB_INSTANCE_CONNECTION_NAME` - Used for CloudSQL

These envronment vars are used for deploying to GCP

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Google service account email
- `GOOGLE_APPLICATION_CREDENTIALS` - Google service account private key

And finally, for Sentry releases

- `SENTRY_AUTH_TOKEN` - Auth token used to create releases
- `SENTRY_ORG` - the Sentry organization
- `SENTRY_PROJECT` - the Sentry project id

### Google Cloud Platform

You'll need to setup a GCP project that has access to Google Cloud Run. You should create a service account that has the following roles:

- `Cloud Run Admin`
- `Service Account User`
- `Cloud SQL Client`

You'll also need to create a private key for the service account (it should download a JSON file). You'll want to run `base64 <path/to/json>` and set it as the `GOOGLE_APPLICATION_CREDENTIALS` secret in GitHub.

### Setting up new projects

This section only matters if you want to gather metrics from other projects than the ones we currently do.

Install [the Github application](https://github.com/organizations/getsentry/settings/apps/sentry-internal-tools/installations) to relevant repos (you will need to contact IT for access to this app). This app is used for GitHub API access to the repos it is installed on.

### Deploying

All pushes to `main` will deploy to the existing GCP project.
