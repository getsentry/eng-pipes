# sentry-development-metrics

Tracks certain development metrics from different services used during development, e.g. GitHub, Travis, Freight

## Setup

Install the github application to relevant repos here: https://github.com/organizations/getsentry/settings/apps/sentry-internal-tools/installations

### Setup Secrets

The following secrets need to be configured in GitHub for this app to function and to deploy to Google.
You can grab GitHub secrets in the app configuration page: https://github.com/organizations/getsentry/settings/apps/sentry-internal-tools

 * `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Google service account email
 * `GOOGLE_APPLICATION_CREDENTIALS` - Google service account private key
 * `GH_APP_IDENTIFIER` - GitHub App identifier
 * `GH_APP_SECRET_KEY` - GitHub App private key
 * `GH_WEBHOOK_SECRET` - GitHub webhook secret to confirm that webhooks come from GitHub
 * `SENTRY_WEBPACK_WEBHOOK_SECRET` - Webhook secret that needs to match secret from CI. Records webpack asset sizes.


## Development

```sh
# Install dependencies
yarn install

# Start dev
yarn dev
```

### Google Cloud Platform

You'll need to setup a GCP project that has access to Google Cloud Run. You should create a service account that has the following roles: `Cloud Run Admin` and `Service Account User`.

You'll also need to create a private key for the service account (it should download a JSON file). You'll want to run `base64 <path/to/json>` and set it as the `GOOGLE_APPLICATION_CREDENTIALS` secret in GitHub.
