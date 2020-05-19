# sentry-development-metrics

Tracks certain development metrics from different services used during development, e.g. GitHub, Travis, Freight

## Setup

```sh
# Install dependencies
yarn install

# Run typescript
yarn build
```

### Setup Secrets

The following secrets need to be configured in GitHub for this app to function and to deploy to Google

 * `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Google service account email
 * `GOOGLE_APPLICATION_CREDENTIALS` - Google service account private key
 * `GITHUB_WEBHOOK_SECRET` - GitHub webhook secret to confirm that webhooks come from GitHub

### Google Cloud Platform

You'll need to setup a GCP project that has access to Google Cloud Run. You should create a service account that has the following roles: `Cloud Run Admin` and `Service Account User`.

You'll also need to create a private key for the service account (it should download a JSON file). You'll want to run `base64 <path/to/json>` and set it as the `GOOGLE_APPLICATION_CREDENTIALS` secret in GitHub.
