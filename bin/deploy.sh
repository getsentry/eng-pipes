#!/bin/sh

PROJECT=super-big-data
IMAGE=gcr.io/${PROJECT}/product-eng-webhooks

env_vars="ENV=production,"
env_vars="${env_vars}GH_APP_PRIVATE_KEY_FOR_GETSENTRY=${GH_APP_PRIVATE_KEY_FOR_GETSENTRY},"
env_vars="${env_vars}GH_APP_PRIVATE_KEY_FOR_CODECOV=${GH_APP_PRIVATE_KEY_FOR_CODECOV},"
env_vars="${env_vars}GH_WEBHOOK_SECRET=${GH_WEBHOOK_SECRET},"
env_vars="${env_vars}SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET},"
env_vars="${env_vars}SLACK_BOT_USER_ACCESS_TOKEN=${SLACK_BOT_USER_ACCESS_TOKEN},"
env_vars="${env_vars}VERSION=${VERSION},"
env_vars="${env_vars}SENTRY_WEBPACK_WEBHOOK_SECRET=${SENTRY_WEBPACK_WEBHOOK_SECRET},"
env_vars="${env_vars}DB_USER=${DB_USER},"
env_vars="${env_vars}DB_NAME=${DB_NAME},"
env_vars="${env_vars}DB_PASSWORD=${DB_PASSWORD},"
env_vars="${env_vars}DB_INSTANCE_CONNECTION_NAME=${DB_INSTANCE_CONNECTION_NAME},"
env_vars="${env_vars}GH_USER_TOKEN=${GH_USER_TOKEN},"


gcloud builds submit --tag $IMAGE --project=$PROJECT --gcs-log-dir=gs://${PROJECT}_cloudbuild/logs && \
gcloud run deploy product-eng-webhooks \
  --image $IMAGE \
  --set-env-vars="$env_vars" \
  --project=$PROJECT \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances ${DB_INSTANCE_CONNECTION_NAME} \
  --region=us-west1


