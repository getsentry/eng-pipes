import { gocdevents } from '@/api/gocdevents';
import {
  FEED_DEV_INFRA_CHANNEL_ID,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import { GoCDResponse } from '@/types';

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

export async function handler(body: GoCDResponse) {
  await devinfraAlert.handle(body);
}

export async function gocdConsecutiveUnsuccessfulAlert() {
  gocdevents.on('stage', handler);
}
