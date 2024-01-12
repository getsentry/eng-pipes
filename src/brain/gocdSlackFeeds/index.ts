import { getUser } from '@/api/getUser';
import { getAuthors } from '@/api/github/getAuthors';
import { gocdevents } from '@/api/gocdevents';
import {
  context,
  header,
  markdown,
  plaintext,
  section,
} from '@/blocks/slackBlocks';
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
import { filterNulls } from '@/utils/arrays';
import { getBaseAndHeadCommit } from '@/utils/gocdHelpers';

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

const IS_ROLLBACK_NECESSARY_LINK =
  'https://www.notion.so/sentry/GoCD-Playbook-920a1a88cf40499ab0baeb9226ffe86d?pvs=4#2e88c4be0354433282267bf09e945973';
const ROLLBACK_PLAYBOOK_LINK =
  'https://www.notion.so/sentry/GoCD-Playbook-920a1a88cf40499ab0baeb9226ffe86d?pvs=4#c6961edd7db34e979623288fe46fd45b';
const GOCD_USER_GUIDE_LINK =
  'https://www.notion.so/sentry/GoCD-User-Guide-4f8456d2477c458095c4aa0e67fc38a6?pvs=4#73e3d374ca744ba8bf66aa6330283f79';

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
    if (pipeline.stage.name === 'checks') {
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
  replyCallback: async (pipeline) => {
    const hasFailedCanary =
      pipeline.stage.name.includes('canary') &&
      pipeline.stage.result.toLowerCase() === 'failed' &&
      pipeline.stage.jobs
        .find((job) => job.name === 'deploy-backend')
        ?.result.toLowerCase() === 'failed';
    if (!hasFailedCanary) return [];
    const [base, head] = await getBaseAndHeadCommit(pipeline);
    const authors = head ? await getAuthors('getsentry', base, head) : [];
    // Get all users who have a slack account
    const users = filterNulls(
      await Promise.all(
        authors.map((author) =>
          getUser({ email: author.email, githubUser: author.login })
        )
      )
    ).filter((user) => user.slackUser);
    // Filter out duplicate users
    const uniqueUsers = users.filter(
      (user, index, self) =>
        index === self.findIndex((u) => u.slackUser === user.slackUser)
    );
    // Pick at most 10 users to cc
    const ccUsers = uniqueUsers.slice(0, 10);
    const ccString = ccUsers
      .map((user) => {
        return `<@${user.slackUser}>`;
      })
      .join(' ');
    const gocdLogsLink = `https://deploy.getsentry.net/go/tab/build/detail/deploy-getsentry-backend-us/${pipeline.counter}/deploy-canary/${pipeline.stage.counter}/deploy-backend`;
    const sentryReleaseLink = `https://sentry.sentry.io/releases/backend@${head}/?project=1`;

    const blocks = [
      header(plaintext(':double_vertical_bar: Canary has been paused')),
      section(
        markdown(
          `The deployment pipeline has been paused due to detected issues in canary.
          Here are the steps you should follow to address the situation:\n\n
          :mag_right: *Step 1: Review the Errors*\n Review the errors in the *<${gocdLogsLink}|Canary Logs>*.\n
          :sentry: *Step 2: Check Sentry Release*\n Check the *<${sentryReleaseLink}|Sentry Release>* for any related issues.\n
          :thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
          :arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
          :arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to unpause the pipeline once it is safe to do so.`
        )
      ),
    ];
    if (ccUsers.length > 0) {
      blocks.push(
        context(
          markdown(
            `cc'ing the following ${
              uniqueUsers.length > 10 ? `10 of ${uniqueUsers.length} ` : ''
            }people who have commits in this deploy:\n${ccString}`
          )
        )
      );
    }
    return blocks;
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
