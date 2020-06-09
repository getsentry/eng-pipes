#!/bin/sh

PROJECT=super-big-data
IMAGE=gcr.io/${PROJECT}/product-eng-webhooks

gcloud builds submit --tag $IMAGE --project=$PROJECT --gcs-log-dir=gs://${PROJECT}_cloudbuild/logs && \
gcloud run deploy product-eng-webhooks \
  --image $IMAGE \
  --set-env-vars=ENV=production,GH_APP_IDENTIFIER="${GH_APP_IDENTIFIER}",GH_APP_SECRET_KEY="${GH_APP_SECRET_KEY}",GH_WEBHOOK_SECRET="${GH_WEBHOOK_SECRET}",SENTRY_WEBPACK_WEBHOOK_SECRET="${SENTRY_WEBPACK_WEBHOOK_SECRET}" \
  --project=$PROJECT \
  --platform managed \
  --allow-unauthenticated \
  --region=us-west1

