# Eng Pipes

This repo contains automation infrastructure for the engineering organization, including:

- CI tooling used in [sentry](https://github.com/getsentry/sentry) and [getsentry](https://github.com/getsentry/sentry) development
- metrics collection and aggregation (for e.g. GitHub)
- a Slack integration to provide tools through Slack

Read the README in the `src/` directory for information on the code structure.

## Architecture

The services that this app is configured for, send metrics to a web app. This app stores the data in Google's BigQuery.
A Looker dashboard (here's an [example]) shows the data it fetches from BigQuery.

The app can also determine that it needs to send a message to the Slack workspace.

[example]: https://sentryio.cloud.looker.com/dashboards/226

![Diagram representing the production](docs/production.svg 'Production diagram')

### Sentry bot Slack app

The Sentry bot Slack app sends events to the production backend. You can find what URL are events sent to by going to "Event subscriptions" in the app page. Events are sent to the "apps/slack/events" route.

The events sent by the bot are defined under "Subscribe to bot events" in the "Event subscriptions" page. The current set of events (which can change over time) are:

- [User clicked into your App Home](https://api.slack.com/events/app_home_opened)
- [Subscribe to only the message events that mention your app or bot](https://api.slack.com/events/app_mention)
- [A message was posted in a direct message channel](https://api.slack.com/events/message.im)
- [A member's data has changed](https://api.slack.com/events/user_change).

### Github Sentry Webhooks

Under Sentry's [webhooks](https://github.com/organizations/getsentry/settings/hooks) there's webhooks to the production backend with the route "webhooks/github".

## Pre-requisites

- [direnv](https://direnv.net/) - Recommended to load env variables
- [Docker](https://www.docker.com/)
- [Yarn](https://yarnpkg.com)

## Setup

`direnv` will create a `.env` file for you if you don't have one. Follow the instructions below and adjust the variables in the `.env` file.

### Setup Secrets

The following secrets are configured in GitHub for this app to function and to deploy to Google.
You can grab GitHub secrets in their respective configuration pages: [GitHub App](https://github.com/organizations/getsentry/settings/apps/getsantry)

#### Local Secrets (required to run yarn dev)

You will also need to set up some of these environment variables if you want to test this locally, e.g. using `direnv` or something similar

- `GH_APP_PRIVATE_KEY` - GitHub App private key for your test app. It needs to all be on one line, but it can include literal '\n' which will be converted to newlines.
- `GH_WEBHOOK_SECRET` - GitHub webhook secret to confirm that webhooks come from GitHub
- `SENTRY_WEBPACK_WEBHOOK_SECRET` - Webhook secret that needs to match secret from CI. Records webpack asset sizes.
- `SLACK_SIGNING_SECRET` - Slack webhook secret to verify payload
- `SLACK_BOT_USER_ACCESS_TOKEN` - The Slack Bot User OAuth Access Token from the `Oauth & Permissions` section of your Slack app

Optional database configuration

- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name
- `DB_INSTANCE_CONNECTION_NAME` - Used for CloudSQL

#### Production Secrets

These environment vars are used for deploying to GCP

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Google service account email
- `GOOGLE_APPLICATION_CREDENTIALS` - Google service account private key

And finally, for Sentry releases

- `SENTRY_AUTH_TOKEN` - Auth token used to create releases
- `SENTRY_PROJECT` - the Sentry project id

### Google Cloud Platform

You'll need to setup a GCP project that has access to Google Cloud Run. You should create a service account that has the following roles:

- `Cloud Run Admin`
- `Service Account User`
- `Cloud SQL Client`

You'll also need to create a private key for the service account (it should download a JSON file). You'll want to run `base64 <path/to/json>` and set it as the `GOOGLE_APPLICATION_CREDENTIALS` secret in GitHub.

## Configuring a test environment

1. Set up [Ngrok](https://ngrok.io/) to redirect calls to your localhost ([smee.io](https://smee.io/) also works).

    - If you haven't already, sign up for an ngrok account and grab the auth token from [the setup page](https://dashboard.ngrok.com/get-started/setup).
    - `ngrok config add-authtoken <YOUR_NGROK_AUTH_TOKEN>`
    - `ngrok http 3000` --> Grab the URL ngrok gives you (e.g. `https://6a88fe29c5cc.ngrok.io` henceforth referred to as `NGROK_INSTANCE`) and save it for step 6

1. Create a new personal Slack workspace from the Slack app (e.g. `Sentry (testing)`). Do not use the Sentry workspace!

    - This workspace should be using your `@sentry.io` account otherwise you'll have a bunch of issues due to the built-in `@sentry.io` checks in this app.

1. Create a [new personal Slack App][slack_app] that matches the settings of the production app

    - The prompt will ask you to associate to a workspace (use the new workspace you made in step 2)

1. In order for your Slack app to work, you need to match the settings to the production Slack app. Run the following command and copy the output into the slack app's App Manifest, making sure to use https:// URLs instead of http:// ones.

    ```shell
    sed 's|<NGROK_URL>|https://<NGROK_INSTANCE>.ngrok.io|g' ./.slack-manifest.example
    ```

    If you have `jq` installed and wish to avoid some manual copy-pasting, the following mini-script will also achieve the same effect once `ngrok http` is running in another terminal:

    ```shell
    sed "s|<NGROK_URL>|$( curl -s localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')|g" ./.slack-manifest.example | pbcopy
    ```

    - Some of the settings will need to be verified before they get saved
    - This means that you will need to update your `.env` file with the settings from your Slack app
    - Reload your server for the new env vars to apply and resend the verification payloads
    - You will have to do this with multiple settings, thus, you will have to repeat reloading your server as you add new variables

1. [Create a GitHub organization](https://github.com/account/organizations/new?plan=free). Name it what you like.

    - In your organization, create a new GitHub repository named something like `testing-eng-pipes`.
    - After the organization has been created, go to its `Settings`, then select `Personal access tokens` from the sidebar to enable tokens.
    - In the setup menu, select `Allow access via fine-grained personal access tokens`, then `Do not require administrator approval`, and finally `Allow access via personal access tokens (classic)`.

1.  [Create a personal access token](https://github.com/settings/tokens/new).

    - Title the new token `Eng-pipes development token`, give this token 90 days until expiration, and enable the following permissions: `read:org` and `read:user`.
    - On the next page, copy the displayed token into the `GH_USER_TOKEN` field of your `.env` file.

      > :warning: **You are giving this token permissions to all orgs across GitHub that you are a member of (though some, like `getsentry`, are configured to require approval before PATs have access)). Be careful and ensure it does not leave your machine!**

1.  [Create a GitHub App](https://github.com/settings/apps/new).

    - Set the webhook to your ngrok tunnel with the GH route (e.g. `<NGROK_INSTANCE>/webhooks/github`)
    - Create and download a private key and add it to your `.env` under `GH_APP_PRIVATE_KEY`. You'll need to strip newlines (or convert them to literal `\n`). (See [Setup Secrets](#setup-secrets) above.)
    - Go to the `Permissions & events` sidebar menu entry of the GitHub app configuration, and grant maximum non-`Admin` access (`Read and write` where possible, `Read only` everywhere else) for every line in `Repository permissions` (NOTE: We use a more constrained permission-set in production, but for initial setup enabling maximal permissions is fine; permissions can be whittled down later as needed.)
    - For `Organization permissions`, grant `Read and write` for `Members` and `Projects`
    - In the `Subscribe to events` section, check every possible box
    - Go to `Install App` in the sidebar menu of the GitHub app configuration, and install the app for your GitHub organization.
    - When prompted, choose `All repositories`.

1. In your GitHub organization, create a new project called `GitHub Issues Someone Else Cares About`.

    - Go to the project's `Settings`, then modify the `Status` field to only have the following options (note the capitalization): `Waiting for: Community`, `Waiting for: Product Owner`, and `Waiting for: Support`.
    - Add a new field (note the capitalization) called `Response Due` of type `Text`.
    - Add a new field (note the capitalization) called `Product Area` of type `Single select`, with the following options: `Alerts`, `Crons`, `Dashboards`, `Discover`, `Issues,` `Performance`, `Profiling`, `Projects`, `Relays`, `Releases`, and `User Feedback`.

1. In your GitHub repository at `[your-org]/testing-eng-pipes-or-whatever`, go to `Issues`, then click `Labels`.

    - Add the labels `Waiting for: Community`, `Waiting for: Product Owner`, and `Waiting for: Support`,
    - Add the labels `Product Area: Alerts`, `Product Area: Crons`, `Product Area: Dashboards`, `Product Area: Discover`, `Product Area: Issues,` `Product Area: Performance`, `Product Area: Profiling`, `Product Area: Projects`, `Product Area: Relays`, `Product Area: Releases`, and `Product Area: User Feedback`

1. Copy the file `github-orgs.example.yml` to `github-orgs.local.yml`.

    - Set an environment variable, `GH_ORGS_YML=github-orgs.local.yml`.

    - Modify it with the slug of your organization and the ID of your app.

    - Leave the `privateKey` as-is, it's the name of an environment variable to pull from (the main `github-orgs.yml` holds public config and is checked into version control).

    - In a terminal, log into the Github CLI using `gh auth login`.

    - Use [this](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#finding-the-node-id-of-an-organization-project) GraphQL query to identify the node ID of the project you made earlier; set `nodeId` to match.

    - Use [this](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#finding-the-node-id-of-a-field) GraphQL query to identify the IDs of the project fields you set up, and use those to populate `fieldIds`.

1. Follow the steps of the "Development & tests" section below to get the server running.

    - It will fail if you don't have all the correct env variables defined

1. Verify that the Slack -> eng-pipes server pipeline works

    - On your new Slack workspace, send a message to the bot
    - You should see your localhost app respond with a 200 status code:

    ![success!](/docs/successful_slack_message.png 'Successful Slack message forwarding')

1. Verify that the GitHub -> eng-pipes server pipeline works

    - In your `testing-eng-pipes` GitHub repository, create a new issue
    - You should see your localhost app response with a 200 status code:

    ![success!](/docs/successful_github_event.png 'Successful GitHub webhook reception')

1. Verify that the GitHub -> eng-pipes server -> Slack pipeline works

    - In your Slack workspace, create a `#test` channel, and in that channel type `/notify-for-triage Alerts sfo` to setup Slack messages
    - Create a new issue in `[your-org]/testing-eng-pipes`, then add the `Product Area: Alerts` label to it
    - You should see a 200 status code in the ngrok window, plus a description of the message in the `yarn dev` window, and a Slack message describing the new issue in the `#test` channel of your Slack workspace

Congratulations, you're all setup!

### Quality-of-life tips

- ngrok gives you a [localhost interface](http://127.0.0.1:4040/inspect/http) to see events coming and to replay them.

- If you have an ngrok Pro account, you can define your own domain, saving you a round trip of having to update the Slack manifest and restarting your server to ingest the autogenerated ngrok domain. You can do this by setting the `--domain` flag when you invoke like so:

```shell
ngrok http 3000 --domain your-fun-unique-subdomain.ngrok.io
```

- GitHub lets you see web hooks events it recently delivered and even redeliver them if needed. Simply go to the `Advanced` section of your GitHub app's settings page, select the event of interest from `Recent Deliveries`, and click the `Redeliver` button to send it again.

- If BigQuery is producing a bunch of logspam for you, try adding `DRY_RUN=true` or `DRY_RUN=1` to your `.env` file.

- If you open this project in VSCode, you can attach the built-in debugger to a running server.
  Rather than using `yarn dev` from the command line, instead open VSCode and select `Debug: Start Debugging` from the command palette:

![startup](/docs/debugger_startup.png 'Start the debugger')

You should hit any breakpoints you set in the code:

![running](/docs/debugger_running.png 'Running debugger paused in the main function')

## Development & tests

Follow the steps in the '''Setup''' section before running these steps:

```sh
# Start local postgres
docker run --rm --name ci-tooling-postgres -e POSTGRES_PASSWORD=docker -d -p 127.0.0.1:5434:5432 postgres:12
# Install dependencies
yarn install
# Update DB
 yarn migrate migrate:latest
# Start dev (it won't work until you set up some of the variables in .env file)
yarn dev
```

Running tests:

```sh
# Testing
yarn test
```

### Setting up new projects

This section only matters if you want to gather metrics from other projects than the ones we currently do.

Install [the Github application](https://github.com/organizations/getsentry/settings/apps/getsantry/installations) to relevant repos (you will need to contact IT for access to this app). This app is used for GitHub API access to the repos it is installed on.

### Deploying

All pushes to `main` will deploy to the existing GCP project.

## TODO

Add notes for the following:

- What code does a service need to call to report to this app?
- How do you build a Looker dashboard?

[slack_app]: https://api.slack.com/apps?new_app=1&manifest_json=%7b%22_metadata%22%3a%7b%22major_version%22%3a1%2c%22minor_version%22%3a1%7d%2c%22display_information%22%3a%7b%22name%22%3a%22Sentry%20Bot%22%2c%22description%22%3a%22Sentry%20development%20tooling%20bot%22%2c%22background_color%22%3a%22%23362d59%22%7d%2c%22features%22%3a%7b%22app_home%22%3a%7b%22home_tab_enabled%22%3atrue%2c%22messages_tab_enabled%22%3atrue%2c%22messages_tab_read_only_enabled%22%3afalse%7d%2c%22bot_user%22%3a%7b%22display_name%22%3a%22Sentaur%22%2c%22always_online%22%3atrue%7d%7d%2c%22oauth_config%22%3a%7b%22scopes%22%3a%7b%22user%22%3a%5b%22users.profile%3aread%22%5d%2c%22bot%22%3a%5b%22app_mentions%3aread%22%2c%22calls%3aread%22%2c%22calls%3awrite%22%2c%22channels%3aread%22%2c%22chat%3awrite%22%2c%22dnd%3aread%22%2c%22files%3aread%22%2c%22groups%3aread%22%2c%22im%3ahistory%22%2c%22im%3aread%22%2c%22im%3awrite%22%2c%22mpim%3ahistory%22%2c%22mpim%3aread%22%2c%22mpim%3awrite%22%2c%22pins%3awrite%22%2c%22reactions%3aread%22%2c%22reactions%3awrite%22%2c%22remote_files%3aread%22%2c%22remote_files%3ashare%22%2c%22remote_files%3awrite%22%2c%22team%3aread%22%2c%22users.profile%3aread%22%2c%22users%3aread%22%2c%22users%3aread.email%22%2c%22users%3awrite%22%2c%22channels%3ajoin%22%5d%7d%7d%2c%22settings%22%3a%7b%22event_subscriptions%22%3a%7b%22request_url%22%3a%22https%3a%2f%2fyour.ngrok.io%2fapps%2fslack%2fevents%22%2c%22bot_events%22%3a%5b%22app_home_opened%22%2c%22app_mention%22%2c%22message.im%22%2c%22user_change%22%5d%7d%2c%22interactivity%22%3a%7b%22is_enabled%22%3atrue%2c%22request_url%22%3a%22https%3a%2f%2fyour.ngrok.io%2fapps%2fslack%2fevents%22%2c%22message_menu_options_url%22%3a%22https%3a%2f%2fyour.ngrok.io%2fapps%2fslack%2fevents%22%7d%2c%22org_deploy_enabled%22%3afalse%2c%22socket_mode_enabled%22%3afalse%2c%22is_hosted%22%3afalse%7d%7d
