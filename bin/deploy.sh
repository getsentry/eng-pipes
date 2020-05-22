#!/bin/sh

PROJECT=super-big-data
IMAGE=gcr.io/${PROJECT}/product-eng-webhooks

gcloud builds submit --tag $IMAGE --project=$PROJECT --gcs-log-dir=gs://${PROJECT}_cloudbuild/logs
gcloud run deploy product-eng-webhooks --image $IMAGE --project=$PROJECT --platform managed --allow-unauthenticated --region=us-west1

