#!/bin/sh

PROJECT=sentry-dev-tooling
IMAGE=gcr.io/${PROJECT}/webhooks

gcloud builds submit --tag $IMAGE --project=$PROJECT
gcloud run deploy webhooks --image $IMAGE --project=$PROJECT --platform managed --allow-unauthenticated --region=us-west1

