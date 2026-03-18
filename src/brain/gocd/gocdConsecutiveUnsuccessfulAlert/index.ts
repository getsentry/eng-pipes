import { gocdevents } from '@/api/gocd/gocdEventEmitter';
import {
  DISCUSS_BACKEND_CHANNEL_ID,
  DISCUSS_FRONTEND_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import { GoCDResponse } from '@/types/gocd';

import { ConsecutiveUnsuccessfulDeploysAlert } from './consecutiveUnsuccessfulDeploysAlert';

const PIPELINE_FILTER = [
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
];

const devinfraAlert = new ConsecutiveUnsuccessfulDeploysAlert({
  slackChannelID: FEED_DEV_INFRA_CHANNEL_ID,
  consecutiveUnsuccessfulLimit: 3,
  pipelineFilter: (pipeline) => {
    return PIPELINE_FILTER.includes(pipeline.name);
  },
});

const discussFrontendAlert = new ConsecutiveUnsuccessfulDeploysAlert({
  slackChannelID: DISCUSS_FRONTEND_CHANNEL_ID,
  consecutiveUnsuccessfulLimit: 3,
  pipelineFilter: (pipeline) =>
    pipeline.name === GOCD_SENTRYIO_FE_PIPELINE_NAME,
});

const discussBackendAlert = new ConsecutiveUnsuccessfulDeploysAlert({
  slackChannelID: DISCUSS_BACKEND_CHANNEL_ID,
  consecutiveUnsuccessfulLimit: 3,
  alertOnlyAtThreshold: true,
  pipelineFilter: (pipeline) =>
    pipeline.name === GOCD_SENTRYIO_BE_PIPELINE_NAME,
});

export async function handler(body: GoCDResponse) {
  await Promise.all([
    devinfraAlert.handle(body),
    discussFrontendAlert.handle(body),
    discussBackendAlert.handle(body),
  ]);
}

export async function gocdConsecutiveUnsuccessfulAlert() {
  gocdevents.on('stage', handler);
}
