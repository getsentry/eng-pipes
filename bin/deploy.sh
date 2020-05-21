#!/bin/sh

PROJECT=super-big-data
IMAGE=gcr.io/${PROJECT}/product_eng

gcloud builds submit --tag $IMAGE --project=$PROJECT
gcloud run deploy product_eng_webhooks --image $IMAGE --project=$PROJECT --platform managed --allow-unauthenticated --region=us-west1

