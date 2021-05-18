# Eng Pipes

This repo contains automation infrastructure for the engineering organization, including:

- CI tooling used in [sentry](https://github.com/getsentry/sentry) and [getsentry](https://github.com/getsentry/sentry) development
- metrics collection and aggregation (for e.g. GitHub, and Freight)
- a Slack integration to provide tools through Slack

Read the README in the `src/` directory for information on the code structure.

## Architecture

The services that this app is configured for, send metrics to a web app. This app stores the data in Google's BigQuery.
A Looker dashboard (here's an [example]) shows the data it fetches from BigQuery.

The app can also determine that it needs to send a message to the Slack workspace.

[example]: https://sentryio.cloud.looker.com/dashboards/226

![Diagram representing the production](docs/production.svg 'Production diagram')

### Sentry bot Slack app

The [Sentry bot](https://api.slack.com/apps/ASUD2NK2S) Slack app sends events to the production backend. You can find what URL are events sent to by going to "Event subscriptions" in the app page. Events are sent to the "apps/slack/events" route.

The events sent by the bot are defined under "Subscribe to bot events" in the "Event subscriptions" page. The current set of events (which can change over time) are:

- [User clicked into your App Home](https://api.slack.com/events/app_home_opened)
- [Subscribe to only the message events that mention your app or bot](https://api.slack.com/events/app_mention)
- [A message was posted in a direct message channel](https://api.slack.com/events/message.im)
- [A member's data has changed](https://api.slack.com/events/user_change).

### Github Sentry Webhooks

Under Sentry's [webhooks](https://github.com/getsentry/sentry/settings/hooks) there's webhooks to the production backend with the route "metrics/github/webhook".

## Pre-requisites

- [direnv](https://direnv.net/) - Recommended to load env variables
- [Docker](https://www.docker.com/)
- [Yarn](https://yarnpkg.com)

## Testing your changes

NOTE: This steps will cover more aspects over time. For now it focuses on testing Slack/Github changes.

You need to set up:

- Set up [Ngrok](https://ngrok.io/) to redirect calls to your localhost
  - `ngrok http 3000` --> Grab the URL ngrok gives you (e.g. `https://6a88fe29c5cc.ngrok.io`)
- Create a new Slack workspace from the Slack app (e.g. `Sentry (testing)`)
- Create a [new Slack App](https://api.slack.com/apps?new_app=1) that matches the settings of the production app
  - The prompt will ask you to associate to a workspace (use the new workspace)
- Follow the steps of "Development & tests" to get the server running
  - It will fail since you don't yet have all the env variables defined
- In order for your Slack app to work, you need to match the settings to the production Slack app
  - Load on your browser the production and personal app on two windows side-by-side
  - You need the match the settings from the following sections:
    - Basic Information
    - App Home
    - Interactivity & Shortcuts
    - OAuth & Permissions
      - You might not need to all the same scopes depending on what you're testing
    - Event Subscriptions
  - Make sure to use https:// URLs instead of http:// ones
  - Some of the settings will need to be verified before they get save
    - This means that you will need to update your `.env` file with the settings from your Slack app
    - Reload your server for the new env vars to apply and resend the verification payloads
    - You will have to do this with multiple settings, thus, you will have to repeat reloading your server as you add new variables
- On your new Slack workspace begin a conversation with the bot
  - You should see your localhost app respond with 200 status code
  - Congratulations!
- Configure the webhook for your Github Sentry fork
  - Create a webhook to your ngrok tunnel with the GH route (e.g. `https://6a88fe29c5cc.ngrok.io/metrics/github/webhook`)
    - Notify on every event
  - Make sure to choose `application/json` instead of `application/x-www-form-urlencoded`
  - Place the `GH_WEBHOOK_SECRET` in your `.env`
  - Push to your fork and see events coming in

NOTE: ngrok gives you a [localhost interface](http://127.0.0.1:4040/inspect/http) to see events coming and to replay them.

NOTE: Github let's you see web hooks events it recently delivered and even redeliver them if needed.

## Development & tests

Follow the steps in the '''Setup''' section before running these steps:

```sh
# Start local postgres
docker run --rm --name ci-tooling-postgres -e POSTGRES_PASSWORD=docker -d -p 127.0.0.1:5434:5432 postgres:12
# Install dependencies
yarn install
# Start dev (it won't work until you set up some of the variables in .env file)
yarn dev
```

Running tests:

```sh
# Testing
yarn test
```

## Setup

`direnv` will create a `.env` file for you if you don't have one. Follow the instructions below and adjust the variables in the `.env` file.

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

## TODO

Add notes for the following:

- What code does a service need to call to report to this app?
- How do you build a Looker dashboard?
