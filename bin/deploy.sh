#!/bin/sh

PROJECT=super-big-data
IMAGE=us-central1-docker.pkg.dev/${PROJECT}/eng-pipes/product-eng-webhooks

env_vars="ENV=production,"
env_vars="${env_vars}VERSION=${VERSION},"
env_vars="${env_vars}DB_USER=${DB_USER},"
env_vars="${env_vars}DB_NAME=${DB_NAME},"
env_vars="${env_vars}DB_INSTANCE_CONNECTION_NAME=${DB_INSTANCE_CONNECTION_NAME},"
env_vars="${env_vars}PREDICT_ENDPOINT=${PREDICT_ENDPOINT},"

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
GOCD_TOKEN
IAP_TARGET_AUDIENCE
GOCD_WEBHOOK_SECRET
KAFKA_CONTROL_PLANE_WEBHOOK_SECRET
SENTRY_OPTIONS_WEBHOOK_SECRET
SENTRY_INFORMER_WEBHOOK_SECRET
"

secrets=""
for secret_name in $secret_names; do
  secrets="${secrets}${secret_name}=eng-pipes-${secret_name}:latest,"
done

gcloud builds submit --tag $IMAGE --project=$PROJECT --gcs-log-dir=gs://${PROJECT}_cloudbuild/logs && \
gcloud run deploy product-eng-webhooks \
  --image $IMAGE \
  --set-env-vars="$env_vars" \
  --set-secrets="$secrets" \
  --project=$PROJECT \
  --platform managed \
  --allow-unauthenticated \
  --service-account ${GCP_SERVICE_ACCOUNT} \
  --add-cloudsql-instances ${DB_INSTANCE_CONNECTION_NAME} \
  --region=us-west1


