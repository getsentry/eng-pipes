import * as Sentry from '@sentry/node';

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
  DISCUSS_BACKEND_CHANNEL_ID,
  FEED_DEPLOY_CHANNEL_ID,
  FEED_DEV_INFRA_CHANNEL_ID,
  FEED_INGEST_CHANNEL_ID,
  FEED_SNS_SAAS_CHANNEL_ID,
  FEED_SNS_ST_CHANNEL_ID,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { GoCDPipeline, GoCDResponse } from '@/types';
import { filterNulls } from '@/utils/arrays';
import { getBaseAndHeadCommit } from '@/utils/gocdHelpers';

import { DeployFeed } from './deployFeed';

enum PauseCause {
  CANARY = 'canary',
  SOAK = 'soak-time',
}

// TODO: consolidate constants for regions
const BACKEND_PIPELINE_FILTER = [
  'deploy-getsentry-backend-s4s',
  'deploy-getsentry-backend-de',
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
];

const INGEST_PIPELINE_FILTER = ['deploy-relay-processing', 'deploy-relay-pop'];

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

const SNS_SAAS_K8S_PIPELINE_FILTER = [
  'snuba-k8s',
  'deploy-snuba-k8s-de',
  'deploy-snuba-k8s-us',
];
const SNS_S4S_K8S_PIPELINE_FILTER = [
  'snuba-s4s-k8s',
  'deploy-snuba-k8s-s4s',
  'deploy-snuba-k8s-customer-1',
  'deploy-snuba-k8s-customer-2',
  'deploy-snuba-k8s-customer-3',
  'deploy-snuba-k8s-customer-4',
  'deploy-snuba-k8s-customer-5',
  'deploy-snuba-k8s-customer-6',
];

const DEV_INFRA_PIPELINE_FILTER = [
  'deploy-gocd-staging',
  'deploy-gocd-production',
  ...BACKEND_PIPELINE_FILTER,
];

export const IS_ROLLBACK_NECESSARY_LINK =
  'https://www.notion.so/sentry/GoCD-Playbook-920a1a88cf40499ab0baeb9226ffe86d?pvs=4#2e88c4be0354433282267bf09e945973';
export const ROLLBACK_PLAYBOOK_LINK =
  'https://www.notion.so/sentry/GoCD-Playbook-920a1a88cf40499ab0baeb9226ffe86d?pvs=4#c6961edd7db34e979623288fe46fd45b';
export const GOCD_USER_GUIDE_LINK =
  'https://www.notion.so/sentry/GoCD-User-Guide-4f8456d2477c458095c4aa0e67fc38a6?pvs=4#73e3d374ca744ba8bf66aa6330283f79';

/**
 * Get the pause cause for a pipeline. A pause cause is a reason why a pipeline
 * has been paused. This is used to determine if we should send a message to
 * slack.
 * @param pipeline The pipeline to get the pause cause for
 * @returns The pause cause or null if there is none
 */
function getPauseCause(pipeline: GoCDPipeline) {
  if (
    pipeline.stage.name.includes('canary') &&
    pipeline.stage.result.toLowerCase() === 'failed' &&
    pipeline.stage.jobs
      .find((job) => job.name === 'deploy-backend')
      ?.result.toLowerCase() === 'failed'
  ) {
    return PauseCause.CANARY;
  }
  if (
    pipeline.stage.name.includes('soak-time') &&
    pipeline.stage.result.toLowerCase() === 'failed'
  ) {
    return PauseCause.SOAK;
  }
  return null;
}

/**
 * Get the unique users from a list of authors
 * @param authors The authors to get the unique users from
 * @returns The unique users
 */
async function getUniqueUsers(authors: { email?: string; login?: string }[]) {
  const users = filterNulls(
    await Promise.all(
      authors.map((author) =>
        getUser({ email: author.email, githubUser: author.login })
      )
    )
  ).filter((user) => user.slackUser);
  // Filter out duplicate users
  return users.filter(
    (user, index, self) =>
      index === self.findIndex((u) => u.slackUser === user.slackUser)
  );
}

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
    return SNS_SAAS_PIPELINE_FILTER.includes(pipeline.name) && pipeline.stage.result.toLowerCase() === 'failed';
  },
});

const snsSaaSK8sFeed = new DeployFeed({
  feedName: 'snsSaaSK8sSlackFeed',
  channelID: FEED_SNS_SAAS_CHANNEL_ID,
  msgType: SlackMessage.FEED_SNS_SAAS_K8S,
  pipelineFilter: (pipeline) => {
    return (
      SNS_SAAS_K8S_PIPELINE_FILTER.includes(pipeline.name) &&
      pipeline.stage.name.includes('k8s_apply')
    );
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

const snsS4SK8sFeed = new DeployFeed({
  feedName: 'snsS4SK8sFeed',
  channelID: FEED_SNS_ST_CHANNEL_ID,
  msgType: SlackMessage.FEED_SNS_S4S_K8S,
  pipelineFilter: (pipeline) => {
    return (
      SNS_S4S_K8S_PIPELINE_FILTER.includes(pipeline.name) &&
      pipeline.stage.name.includes('k8s_apply')
    );
  },
});

// Post certain pipelines to #discuss-ingest
const ingestFeed = new DeployFeed({
  feedName: 'ingestSlackFeed',
  channelID: FEED_INGEST_CHANNEL_ID,
  msgType: SlackMessage.FEED_INGEST_DEPLOY,
  pipelineFilter: (pipeline) => {
    return INGEST_PIPELINE_FILTER.includes(pipeline.name);
  },
});

// Post certain pipelines to #discuss-backend
const discussBackendFeed = new DeployFeed({
  feedName: 'discussBackendSlackFeed',
  channelID: DISCUSS_BACKEND_CHANNEL_ID,
  msgType: SlackMessage.DISCUSS_BACKEND_DEPLOY,
  pipelineFilter: (pipeline) => {
    // We only want to log the getsentry FE and BE pipelines
    if (!BACKEND_PIPELINE_FILTER.includes(pipeline.name)) {
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
    const pauseCause = getPauseCause(pipeline);

    if (pauseCause == null) return [];
    const [base, head] = await getBaseAndHeadCommit(pipeline);
    const authors = head ? await getAuthors('getsentry', base, head) : [];
    // Get unique users from the authors
    const uniqueUsers = await getUniqueUsers(authors);

    // Pick at most 10 users to cc
    const ccUsers = uniqueUsers.slice(0, 10);
    const ccString = ccUsers
      .map((user) => {
        return `<@${user.slackUser}>`;
      })
      .join(' ');

    const failedJob = pipeline.stage.jobs.find(
      (job) => job.result.toLowerCase() === 'failed'
    );
    if (!failedJob) {
      // This should never happen, but if it does, we want to know about it
      Sentry.captureException(
        new Error('Failed to find failed job in failed pipeline')
      );
      return [];
    }
    const gocdLogsLink = `https://deploy.getsentry.net/go/tab/build/detail/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}/${failedJob.name}`;
    const sentryReleaseLink = pipeline.name.includes('s4s')
      ? `https://sentry-st.sentry.io/releases/backend@${head}/?project=1513938`
      : `https://sentry.sentry.io/releases/backend@${head}/?project=1`;

    const blocks = [
      header(
        plaintext(`:double_vertical_bar: ${pipeline.name} has been paused`)
      ),
      section(
        markdown(`The deployment pipeline has been paused due to detected issues in ${pauseCause}. Here are the steps you should follow to address the situation:\n
:mag_right: *Step 1: Review the Errors*\n Review the errors in the *<${gocdLogsLink}|GoCD Logs>*.\n
:sentry: *Step 2: Check Sentry Release*\n Check the *<${sentryReleaseLink}|Sentry Release>* for any related issues.\n
:thinking_face: *Step 3: Is a Rollback Necessary?*\nDetermine if a rollback is necessary by reviewing our *<${IS_ROLLBACK_NECESSARY_LINK}|Guidelines>*.\n
:arrow_backward: *Step 4: Rollback Procedure*\nIf a rollback is necessary, use the *<${ROLLBACK_PLAYBOOK_LINK}|GoCD Playbook>* or *<${GOCD_USER_GUIDE_LINK}|GoCD User Guide>* to guide you.\n
:arrow_forward: *Step 5: Unpause the Pipeline*\nWhether or not a rollback was necessary, make sure to unpause the pipeline once it is safe to do so.`)
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
    discussBackendFeed.handle(body),
    snsSaaSFeed.handle(body),
    snsSTFeed.handle(body),
    ingestFeed.handle(body),
    snsS4SK8sFeed.handle(body),
    snsSaaSK8sFeed.handle(body),
  ]);
}

export async function gocdSlackFeeds() {
  gocdevents.on('stage', handler);
}
