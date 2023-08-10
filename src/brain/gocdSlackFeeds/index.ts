import { gocdevents } from '@/api/gocdevents';
import {
  FEED_DEPLOY_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  FEED_ENGINEERING_CHANNEL_ID,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { GoCDResponse } from '@/types';

import { DeployFeed } from './deployFeed';

const ENGINEERING_PIPELINE_FILTER = [
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
];

const DEV_INFRA_PIPELINE_FILTER = [
  'deploy-gocd-staging',
  'deploy-gocd-production',
  ...ENGINEERING_PIPELINE_FILTER,
];

// Post all pipelines to #feed-deploys
const deployFeed = new DeployFeed({
  feedName: 'gocdSlackFeed',
  channelID: FEED_DEPLOY_CHANNEL_ID,
  msgType: SlackMessage.FEED_ENG_DEPLOY,
});

// Post certain pipelines to #feed-dev-infra
const devinfraFeed = new DeployFeed({
  feedName: 'devinfraSlackFeed',
  channelID: FEED_DEV_INFRA_CHANNEL_ID,
  msgType: SlackMessage.FEED_DEV_INFRA_GOCD_DEPLOY,
  pipelineFilter: (pipeline) => {
    if (!DEV_INFRA_PIPELINE_FILTER.includes(pipeline.name)) {
      return false;
    }

    // Checks failing typically indicate GitHub flaking or a temporary
    // issue with master. We have sentry alerts to monitor this.
    if (pipeline.stage.name == 'checks') {
      return false;
    }

    // We only really care about creating new messages if the pipeline has
    // failed.
    return pipeline.stage.result.toLowerCase() === 'failed';
  },
});

// Post certain pipelines to #team-engineering
const engineeringFeed = new DeployFeed({
  feedName: 'engineeringSlackFeed',
  channelID: FEED_ENGINEERING_CHANNEL_ID,
  msgType: SlackMessage.FEED_ENGINGEERING_DEPLOY,
  pipelineFilter: (pipeline) => {
    // We only want to log the getsentry FE and BE pipelines
    if (!ENGINEERING_PIPELINE_FILTER.includes(pipeline.name)) {
      return false;
    }

    // We don't care about the checks stage failing as it is flaky and noisy.
    if (pipeline.stage.name.toLowerCase() === 'checks') {
      return false;
    }

    // We only really care about creating new messages if the pipeline has
    // failed.
    return pipeline.stage.result.toLowerCase() === 'failed';
  },
});

export async function handler(body: GoCDResponse) {
  await Promise.all([
    deployFeed.handle(body),
    devinfraFeed.handle(body),
    engineeringFeed.handle(body),
  ]);
}

export async function gocdSlackFeeds() {
  gocdevents.on('stage', handler);
}
