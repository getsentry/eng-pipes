import * as Sentry from '@sentry/node';

import {
  CompareCommits,
  GoCDBuildCause,
  GoCDPipeline,
  GoCDResponse,
  GoCDStage,
} from '@types';

import { ClientType } from '@/api/github/clientType';
import { getChangedStack } from '@/api/github/getChangedStack';
import { getRelevantCommit } from '@/api/github/getRelevantCommit';
import { gocdevents } from '@/api/gocdevents';
import { getUpdatedGoCDDeployMessage } from '@/blocks/getUpdatedDeployMessage';
import {
  Color,
  GETSENTRY_REPO,
  OWNER,
  SENTRY_REPO,
  SENTRYIO_GOCD_PIPELINE_GROUP,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { clearQueuedCommits } from '@/utils/db/clearQueuedCommits';
import { getLatestGoCDDeploy } from '@/utils/db/getLatestDeploy';
import { queueCommitsForDeploy } from '@/utils/db/queueCommitsForDeploy';
import { getUser } from '@api/getUser';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { getSlackMessage } from '@utils/db/getSlackMessage';

const QUEUED_MSG = 'is queued for deployment';
const INPROGRESS_MSG = 'is being deployed';
const DEPLOYED_MSG = 'was deployed';
const FAILED_MSG = 'failed to deploy';

function getProgressSuffix(stage: GoCDStage) {
  switch (stage.result.toLowerCase()) {
    case 'passed':
      return DEPLOYED_MSG;
    case 'failed':
      return FAILED_MSG;
    case 'unknown':
      if (parseInt(stage.counter, 10) > 1) {
        return INPROGRESS_MSG;
      } else {
        return QUEUED_MSG;
      }
  }
  return '';
}

function getProgressMessage(stage: GoCDStage, message: any) {
  const progressText = getProgressSuffix(stage);
  if (!progressText) {
    return '';
  }

  const replaceValues = [
    QUEUED_MSG,
    INPROGRESS_MSG,
    DEPLOYED_MSG,
    FAILED_MSG,
    'is ready to deploy',
    'is being deployed',
  ];
  let msg = message.context.text;
  for (const r of replaceValues) {
    msg = msg.replace(r, progressText);
  }
  return msg;
}

function getProgressColor(stage: GoCDStage) {
  switch (stage.result.toLowerCase()) {
    case 'passed':
      return Color.SUCCESS;
    case 'unknown':
      return Color.OFF_WHITE_TOO;
    default:
      return Color.DANGER;
  }
}

async function updateSlackMessage(message: any, pipeline: GoCDPipeline) {
  const { stage } = pipeline;

  const progressText = getProgressMessage(stage, message);
  const progressColor = getProgressColor(stage);

  const updatedBlocks = message.context.blocks.slice(0, -1);
  const payloadUser = await getUser({ email: stage['approved-by'] });
  const isUserDeploying = message.context.target === payloadUser?.slackUser;

  const updatedDeployMessage = getUpdatedGoCDDeployMessage({
    isUserDeploying,
    slackUser: payloadUser?.slackUser,
    pipeline: {
      pipeline_name: pipeline.name,
      pipeline_counter: parseInt(pipeline.counter, 10),
      stage_name: stage.name,
      stage_counter: parseInt(stage.counter, 10),
      stage_state: stage.state,
    },
  });

  updatedBlocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: updatedDeployMessage,
    },
  });

  // We can bypass using `slackMessageUser` because these notifications will only
  // exist if they have been messaged already
  const promises = [
    // Currently, we ignore deploy errors so they will just see the original messages
    // with the actions to deploy
    //
    // Update original message body with deploy status
    bolt.client.chat.update({
      ts: message.ts,
      channel: message.channel,
      text: progressText,
      attachments: [
        {
          color: progressColor,
          blocks: !progressText ? message.context.blocks : updatedBlocks,
        },
      ],
    }),
  ];

  if (stage.result === 'Passed') {
    // We want to thread a message only when the commit is deployed
    promises.push(
      bolt.client.chat.postMessage({
        thread_ts: message.ts,
        channel: message.channel,
        text: `Your commit has been deployed. *Note* This message from Sentaur is now deprecated as this feature is now native to Sentry. Please <https://sentry.io/settings/account/notifications/deploy/|configure your Sentry deploy notifications here> to turn on Slack deployment notifications`,
      })
    );
  }

  return await Promise.all(promises);
}

async function updateSlack(
  pipeline: GoCDPipeline,
  relevantCommitShas: Array<string>
): Promise<Array<Promise<any>>> {
  // Look for associated slack messages based on getsentry commit sha
  const messages = await getSlackMessage(
    SlackMessage.PLEASE_DEPLOY,
    relevantCommitShas
  );

  Sentry.withScope((scope) => {
    scope.setContext('gocd', {
      ...pipeline,
      title: 'gocd',
      description: `${pipeline.group}_${pipeline.name}_${pipeline.counter}`,
      commits: relevantCommitShas,
      updatedMessages: messages.map((m) => m.channel),
    });
  });

  return messages.map(async (message) => {
    await updateSlackMessage(message, pipeline);
  });
}

async function getLatestDeploy(pipeline: GoCDPipeline): Promise<null | any> {
  try {
    // Retrieves the latest/previous deploy for either
    // `getsentry-backend` or `getsentry-frontend` to see which
    // commits are going out.
    return await getLatestGoCDDeploy(pipeline.group, pipeline.name);
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  }
  return null;
}

async function updateCommitQueue(
  pipeline: GoCDPipeline,
  sha: string,
  commits: CompareCommits['commits']
) {
  const { stage } = pipeline;

  switch (stage.result) {
    case 'Unknown':
      await queueCommitsForDeploy(commits);
      break;
    case 'Passed':
      await clearQueuedCommits(sha);
      break;
    default:
      Sentry.captureException(
        new Error(`Unexpected stage result: ${stage.result}`)
      );
      break;
  }
}

// Depending on whether `getsentry-frontend` or `getsentry-backend`
// is being deployed, only certain commits (FE/BE) will be
// affected. Filter the sha list to just FE or BE commits.
async function filterCommits(octokit, pipeline, commits) {
  const relevantCommitShas: string[] = [];
  const commitShas = commits.map(({ sha }) => sha);
  for (const sha of commitShas) {
    const relevantCommit = await getRelevantCommit(sha, octokit);
    // Commit should exist, but if not log and move on
    if (!relevantCommit) {
      Sentry.setContext('commit', {
        commit_sha: sha,
      });
      Sentry.captureException(new Error('Unable to find commit'));
      continue;
    }

    const relevantRepo =
      relevantCommit.sha === sha ? GETSENTRY_REPO : SENTRY_REPO;
    const { isFrontendOnly, isBackendOnly } = await getChangedStack(
      relevantCommit.sha,
      relevantRepo
    );

    // NOTE: We do not handle scenarios where the commit has both
    // frontend and backend changes.
    if (
      (isFrontendOnly &&
        pipeline.name == process.env.SENTRYIO_GOCD_FE_PIPELINE_NAME) ||
      (isBackendOnly &&
        pipeline.name == process.env.SENTRYIO_GOCD_BE_PIPELINE_NAME)
    ) {
      relevantCommitShas.push(sha);
    } else {
      // TODO (mattgaunt): DO NOT COMMIT THIS!
      relevantCommitShas.push(sha);
    }
  }
  return relevantCommitShas;
}

async function getCommitsInDeployment(octokit, sha, prevsha) {
  if (prevsha) {
    const { data } = await octokit.repos.compareCommits({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      head: sha,
      base: prevsha,
    });
    return data.commits;
  }
  const resp = await octokit.repos.getCommit({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    ref: sha,
  });
  return [resp.data];
}

function getGetsentrySHA(buildcauses: Array<GoCDBuildCause>) {
  for (const bc of buildcauses) {
    if (!bc.material || !bc.material['git-configuration']) {
      continue;
    }
    const url = bc.material['git-configuration'].url;
    if (url.indexOf(`${OWNER}/${GETSENTRY_REPO}`) != -1) {
      return bc.modifications[0].revision;
    }
  }
  return null;
}

/**
 * This handler listens to Freight for deploys of `getsentry` to production.
 * Users receive a Slack notification when their commit passes CI and is ready
 * to deploy.  This will update those Slack messages telling them that their
 * commit has been queued to be deployed (if applicable).
 *
 * (Exported for tests)
 */
export async function handler(resBody: GoCDResponse) {
  const { pipeline } = resBody.data;

  // The getsentry / sentry pipelines are under this group
  if (pipeline.group !== SENTRYIO_GOCD_PIPELINE_GROUP) {
    return;
  }

  // This is not a getsentry deploy.
  const sha = getGetsentrySHA(pipeline['build-cause']);
  if (!sha) {
    return;
  }

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'notifyOnGoCDStageEvent',
  });
  Sentry.configureScope((scope) => scope.setSpan(tx));

  // Get the range of commits for this payload
  const octokit = await getClient(ClientType.App, OWNER);

  try {
    const latestDeploy = await getLatestDeploy(pipeline);
    const commits = await getCommitsInDeployment(
      octokit,
      sha,
      latestDeploy?.sha
    );
    const relevantCommitShas: string[] = await filterCommits(
      octokit,
      pipeline,
      commits
    );

    await Promise.all([
      updateCommitQueue(pipeline, sha, commits),
      ...(await updateSlack(pipeline, relevantCommitShas)),
    ]);
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  }

  tx.finish();
}

export async function notifyOnGoCDStageEvent() {
  gocdevents.on('stage', handler);

  // TODO (mattgaunt): Figure out where open-sentry-release-* needs to live,
  // either here or in updateDeployNotifications or ....
}