import '@sentry/tracing';

import * as Sentry from '@sentry/node';
import { SlackMessageRow } from 'knex/types/tables';

import {
  CompareCommits,
  GoCDBuildCause,
  GoCDPipeline,
  GoCDResponse,
  GoCDStageData,
} from '@types';

import { getChangedStack } from '@/api/github/getChangedStack';
import { getRelevantCommit } from '@/api/github/getRelevantCommit';
import { getUpdatedGoCDDeployMessage } from '@/blocks/getUpdatedDeployMessage';
import {
  GETSENTRY_ORG,
  GETSENTRY_REPO_SLUG,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
  SENTRY_REPO_SLUG,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { gocdevents } from '@/init/gocdevents';
import { bolt } from '@/init/slack';
import { clearQueuedCommits } from '@/utils/db/clearQueuedCommits';
import { getLastGetSentryGoCDDeploy } from '@/utils/db/getLatestDeploy';
import { queueCommitsForDeploy } from '@/utils/db/queueCommitsForDeploy';
import {
  ALL_MESSAGE_SUFFIX,
  filterBuildCauses,
  FINAL_STAGE_NAMES,
  firstGitMaterialSHA,
  getProgressColor,
  getProgressSuffix,
} from '@/utils/gocdHelpers';
import { getUser } from '@api/getUser';
import { GitHubOrg } from '@api/github/org';
import { getSlackMessage } from '@utils/db/getSlackMessage';

function getProgressMessage(pipeline: GoCDPipeline, message: any) {
  const progressText = getProgressSuffix(pipeline);
  if (!progressText) {
    return '';
  }

  let msg = message.context.text;
  for (const r of ALL_MESSAGE_SUFFIX) {
    msg = msg.replace(r, progressText);
  }
  return msg;
}

async function updateSlackMessage(message: any, pipeline: GoCDPipeline) {
  const progressText = getProgressMessage(pipeline, message);
  const progressColor = getProgressColor(pipeline);

  const { stage } = pipeline;
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

  if (
    FINAL_STAGE_NAMES.includes(stage.name) &&
    stage.result.toLowerCase() === 'passed'
  ) {
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
  relevantCommitShas: Array<string>,
  messages: SlackMessageRow<SlackMessage>[]
): Promise<Array<Promise<void>>> {
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

async function updateCommitQueue(
  pipeline: GoCDPipeline,
  sha: string,
  commits: CompareCommits['commits']
) {
  const { stage } = pipeline;

  switch (stage.result.toLowerCase()) {
    case 'unknown':
      await queueCommitsForDeploy(commits);
      break;
    case 'passed':
      if (FINAL_STAGE_NAMES.includes(stage.name)) {
        await clearQueuedCommits(sha);
      }
      break;
    case 'failed':
    case 'cancelled':
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
async function filterCommits(pipeline, commits) {
  const relevantCommitShas: string[] = [];
  const commitShas = commits.map(({ sha }) => sha);
  const getRelevantCommitShas = async (sha) => {
    const relevantCommit = await getRelevantCommit(sha);
    // Commit should exist, but if not log and move on
    if (!relevantCommit) {
      Sentry.setContext('commit', {
        commit_sha: sha,
      });
      Sentry.captureException(new Error('Unable to find commit'));
      return;
    }

    const relevantRepo =
      relevantCommit.sha === sha ? GETSENTRY_REPO_SLUG : SENTRY_REPO_SLUG;
    const { isFrontendOnly, isBackendOnly } = await getChangedStack(
      relevantCommit.sha,
      relevantRepo
    );

    // NOTE: We do not handle scenarios where the commit has both
    // frontend and backend changes.
    if (
      (isFrontendOnly && pipeline.name === GOCD_SENTRYIO_FE_PIPELINE_NAME) ||
      (isBackendOnly && pipeline.name === GOCD_SENTRYIO_BE_PIPELINE_NAME)
    ) {
      relevantCommitShas.push(sha);
    }
  };
  await Promise.allSettled(commitShas.map((sha) => getRelevantCommitShas(sha)));
  return relevantCommitShas;
}

async function getCommitsInDeployment(
  org: GitHubOrg,
  sha: string,
  prevsha: string | null
): Promise<CompareCommits['commits']> {
  if (prevsha && prevsha !== sha) {
    const { data } = await org.api.repos.compareCommits({
      owner: GETSENTRY_ORG.slug,
      repo: GETSENTRY_REPO_SLUG,
      head: sha,
      base: prevsha,
    });
    return data.commits;
  }
  const resp = await org.api.repos.getCommit({
    owner: GETSENTRY_ORG.slug,
    repo: GETSENTRY_REPO_SLUG,
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
    if (url.indexOf(`${GETSENTRY_ORG.slug}/${GETSENTRY_REPO_SLUG}`) !== -1) {
      return bc.modifications[0].revision;
    }
  }
  return null;
}

/**
 * This handler listens to GoCD for deploys of `getsentry` to production.
 * Users receive a Slack notification when their commit passes CI and is ready
 * to deploy.  This will update those Slack messages telling them that their
 * commit has been queued to be deployed (if applicable).
 *
 * (Exported for tests)
 */
export async function handler(resBody: GoCDResponse) {
  const { pipeline } = resBody.data as GoCDStageData;

  // Only notify on the getsentry frontend / backend
  // pipelines.
  if (
    pipeline.name !== GOCD_SENTRYIO_FE_PIPELINE_NAME &&
    pipeline.name !== GOCD_SENTRYIO_BE_PIPELINE_NAME
  ) {
    return;
  }

  // This is not a getsentry deploy.
  const sha = getGetsentrySHA(filterBuildCauses(pipeline, 'git'));
  if (!sha) {
    return;
  }

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'notifyOnGoCDStageEvent',
  });
  Sentry.configureScope((scope) => scope.setSpan(tx));

  // Get the range of commits for this payload
  try {
    const latestDeploy = await getLastGetSentryGoCDDeploy(
      pipeline.group,
      pipeline.name
    );
    const commits = await getCommitsInDeployment(
      GETSENTRY_ORG,
      sha,
      firstGitMaterialSHA(latestDeploy)
    );
    const relevantCommitShas: string[] = await filterCommits(pipeline, commits);
    // Look for associated slack messages based on getsentry commit sha
    const messages = await getSlackMessage(
      SlackMessage.PLEASE_DEPLOY,
      relevantCommitShas
    );
    await Promise.all([
      updateCommitQueue(pipeline, sha, commits),
      ...(await updateSlack(pipeline, relevantCommitShas, messages)),
    ]);
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  } finally {
    tx.finish();
  }
}

export async function notifyOnGoCDStageEvent() {
  gocdevents.on('stage', handler);

  bolt.action(/open-sentry-release-(.*)/, async ({ ack, body, context }) => {
    await ack();
    Sentry.withScope(async (scope) => {
      scope.setUser({
        id: body.user.id,
      });
      Sentry.startTransaction({
        op: 'slack.action',
        name: `open-sentry-release-${context.actionIdMatches[1]}`,
      }).finish();
    });
  });
}
