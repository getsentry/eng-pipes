#!/bin/sh

PROJECT=super-big-data
IMAGE=gcr.io/${PROJECT}/product-eng-webhooks

env_vars="ENV=production,"
env_vars="${env_vars}VERSION=${VERSION},"
env_vars="${env_vars}DB_USER=${DB_USER},"
env_vars="${env_vars}DB_NAME=${DB_NAME},"
env_vars="${env_vars}DB_INSTANCE_CONNECTION_NAME=${DB_INSTANCE_CONNECTION_NAME},"

secret_names="
GH_APP_PRIVATE_KEY_FOR_GETSENTRY
GH_APP_PRIVATE_KEY_FOR_CODECOV
DD_API_KEY
DD_APP_KEY
GH_WEBHOOK_SECRET
SLACK_SIGNING_SECRET
SLACK_BOT_USER_ACCESS_TOKEN
SENTRY_WEBPACK_WEBHOOK_SECRET
DB_PASSWORD
GH_USER_TOKEN
"

secrets=""
for secret_name in $secret_names; do
  secrets="${secrets}${secret_name}=eng-pipes-${secret_name},"
done

# secrets="DD_API_KEY=eng-pipes-DD_API_KEY:latest,"

gcloud builds submit --tag $IMAGE --project=$PROJECT --gcs-log-dir=gs://${PROJECT}_cloudbuild/logs && \
gcloud run deploy product-eng-webhooks \
  --image $IMAGE \
  --set-env-vars="$env_vars" \
  --set-secrets="$secrets" \
  --project=$PROJECT \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances ${DB_INSTANCE_CONNECTION_NAME} \
  --region=us-west1


