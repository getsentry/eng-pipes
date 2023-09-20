import { gocdevents } from '@/api/gocdevents';
import {
  FEED_DEPLOY_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  FEED_ENGINEERING_CHANNEL_ID,
  FEED_SNS_SAAS_CHANNEL_ID,
  FEED_SNS_ST_CHANNEL_ID,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { GoCDResponse } from '@/types';

import { DeployFeed } from './deployFeed';

const ENGINEERING_PIPELINE_FILTER = [
  'deploy-getsentry-backend-s4s',
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
];

const SNS_SAAS_PIPELINE_FILTER = [
  'deploy-snuba',
  'rollback-snuba',
  'deploy-snuba-s4s',
  'deploy-snuba-us',
  'deploy-snuba-stable',
];

const SNS_ST_PIPELINE_FILTER = [
  'deploy-snuba-customer-1',
  'deploy-snuba-customer-2',
  'deploy-snuba-customer-3',
  'deploy-snuba-customer-4',
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

// Post certain pipelines to #feed-sns
const snsSaaSFeed = new DeployFeed({
  feedName: 'snsSaaSSlackFeed',
  channelID: FEED_SNS_SAAS_CHANNEL_ID,
  msgType: SlackMessage.FEED_SNS_SAAS_DEPLOY,
  pipelineFilter: (pipeline) => {
    return SNS_SAAS_PIPELINE_FILTER.includes(pipeline.name);
  },
});

// Post certain pipelines to #feed-sns-st
const snsSTFeed = new DeployFeed({
  feedName: 'snsSTSlackFeed',
  channelID: FEED_SNS_ST_CHANNEL_ID,
  msgType: SlackMessage.FEED_SNS_ST_DEPLOY,
  pipelineFilter: (pipeline) => {
    return SNS_ST_PIPELINE_FILTER.includes(pipeline.name);
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

    // Checks create a lot of noise that is normally not actionable
    if (pipeline.stage.name === 'checks') {
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
    snsSaaSFeed.handle(body),
    snsSTFeed.handle(body),
    engineeringFeed.handle(body),
  ]);
}

export async function gocdSlackFeeds() {
  gocdevents.on('stage', handler);
}
