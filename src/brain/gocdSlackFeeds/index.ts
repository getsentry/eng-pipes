import { gocdevents } from '@/api/gocdevents';
import { FEED_DEPLOY_CHANNEL_ID, FEED_DEV_INFRA_CHANNEL_ID, GOCD_SENTRYIO_BE_PIPELINE_NAME, GOCD_SENTRYIO_FE_PIPELINE_NAME } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { SlackDeployFeed } from './slackDeployFeed';

const DEV_INFRA_PIPELINE_FILTER = [
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
  "deploy-gocd-staging",
  "deploy-gocd-production",
];

export async function gocdSlackFeeds() {
  // Post all pipelines to #feed-deploys
  const deployFeed = new SlackDeployFeed({
    feedName: 'gocdSlackFeed',
    channelID: FEED_DEPLOY_CHANNEL_ID,
    msgType: SlackMessage.FEED_ENG_DEPLOY,
  });

  // Post certain pipelines to #feed-dev-infra
  const devinfraFeed = new SlackDeployFeed({
    feedName: 'devinfraSlackFeed',
    channelID: FEED_DEV_INFRA_CHANNEL_ID,
    msgType: SlackMessage.FEED_DEV_INFRA_GOCD_DEPLOY,
    pipelineFilter: (pipeline) => {
      if (!DEV_INFRA_PIPELINE_FILTER.includes(pipeline.name)) {
        return false;
      }

      // We only really care about creating new messages if the pipeline has
      // failed.
      return pipeline.stage.result.toLowerCase() === 'failed';
    },
  });

  gocdevents.on('stage', (body) => {
    deployFeed.handle(body);
    devinfraFeed.handle(body);
  });
}
