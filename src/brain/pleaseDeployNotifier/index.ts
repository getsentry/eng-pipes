import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';

import { getUser } from '@/api/getUser';
import { githubEvents } from '@/api/github';
import { getChangedStack } from '@/api/github/getChangedStack';
import { getRelevantCommit } from '@/api/github/getRelevantCommit';
import { isGetsentryRequiredCheck } from '@/api/github/isGetsentryRequiredCheck';
import { slackMessageUser } from '@/api/slackMessageUser';
import { getUpdatedGoCDDeployMessage } from '@/blocks/getUpdatedDeployMessage';
import { gocdDeploy } from '@/blocks/gocdDeploy';
import { muteDeployNotificationsButton } from '@/blocks/muteDeployNotificationsButton';
import { viewUndeployedCommits } from '@/blocks/viewUndeployedCommits';
import {
  GETSENTRY_REPO,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
  SENTRY_REPO,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { getGoCDDeployForQueuedCommit } from '@/utils/db/getDeployForQueuedCommit';
import { saveSlackMessage } from '@/utils/db/saveSlackMessage';
import { INPROGRESS_MSG, READY_TO_DEPLOY } from '@/utils/gocdHelpers';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { bolt } from '@api/slack';
import { wrapHandler } from '@utils/wrapHandler';

import { actionSlackDeploy } from './actionSlackDeploy';
import { actionViewUndeployedCommits } from './actionViewUndeployedCommits';

function deployInProgressBlocks(details): Array<KnownBlock> {
  const { gocdDeployInfo, user } = details;

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: getUpdatedGoCDDeployMessage({
          isUserDeploying: gocdDeployInfo.stage_approved_by == user.email,
          slackUser: user.slackUser,
          pipeline: gocdDeployInfo,
        }),
      },
    },
  ];
}

function deployActionBlocks(details): Array<KnownBlock> {
  const { check_run: checkRun } = details.payload;

  return [
    {
      type: 'actions',
      elements: [
        gocdDeploy(checkRun.head_sha),
        viewUndeployedCommits(checkRun.head_sha),
        muteDeployNotificationsButton(),
      ],
    },
  ];
}

function shouldProcessCheckRun({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'check_run'>) {
  // Make sure this is on `getsentry` and we are examining the aggregate "required check" run
  if (!isGetsentryRequiredCheck({ id, payload, ...rest })) {
    return false;
  }

  const { check_run: checkRun } = payload;
  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // Ignore non-"successful" conclusions
  return checkRun.conclusion === 'success';
}

async function getRequiredDetails(payload) {
  const { check_run: checkRun } = payload;

  // Find the author of the commit, we should probably link both getsentry? and sentry?
  const relevantCommit = await getRelevantCommit(checkRun.head_sha);
  if (!relevantCommit) {
    throw new Error('Failed to find relevant commit');
  }

  // Message author on slack that their commit is ready to deploy
  // and send a link to start a deploy
  const user = await getUser({
    githubUser: relevantCommit.author?.login,
    email: relevantCommit.commit.author?.email,
  });

  if (!user?.slackUser) {
    throw new Error('Failed to find a slack user');
  }

  // checkRun.head_sha will always be from getsentry, so if relevantCommit's
  // sha differs, it means that the relevantCommit is on the sentry repo
  const relevantCommitRepo =
    relevantCommit.sha === checkRun.head_sha ? GETSENTRY_REPO : SENTRY_REPO;
  const changeType = await getChangedStack(
    relevantCommit.sha,
    relevantCommitRepo
  );

  // Look for queued commits and see if current commit is queued
  let pipeline_name = GOCD_SENTRYIO_BE_PIPELINE_NAME;
  if (changeType.isFrontendOnly) {
    pipeline_name = GOCD_SENTRYIO_FE_PIPELINE_NAME;
  }
  const gocdDeployInfo = await getGoCDDeployForQueuedCommit(
    checkRun.head_sha,
    pipeline_name
  );

  return {
    payload,
    relevantCommit,
    relevantCommitRepo,
    user,
    changeType,
    gocdDeployInfo,
  };
}

async function getBody(details) {
  const commit = details.relevantCommit.sha;
  const repo = details.payload.repository;
  const commitLink = `https://github.com/${repo.full_name}/commits/${commit}`;
  const commitLinkText = `${commit.slice(0, 7)}`;

  let suffix = READY_TO_DEPLOY;
  if (details.changeType.isFullstack) {
    suffix = `is a full stack change and ready to deploy on both the frontend and backend`;
  }
  if (details.gocdDeployInfo) {
    suffix = INPROGRESS_MSG;
  }
  return `Your commit ${repo.name}@<${commitLink}|${commitLinkText}> ${suffix}`;
}

async function postPleaseDeployMessage(
  event: EmitterWebhookEvent<'check_run'>
) {
  const details = await getRequiredDetails(event.payload);

  const text = await getBody(details);
  const blocks: Array<KnownBlock> = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚀 ${text}`,
      },
    },
    {
      type: 'divider',
    },
  ];
  blocks.push(...(await getBlocksForCommit(details.relevantCommit)));

  // If the commit is already queued, add that message, otherwise
  // show actions to start the deploy / review it.
  if (details.gocdDeployInfo) {
    blocks.push(...deployInProgressBlocks(details));
  } else {
    blocks.push(...deployActionBlocks(details));
  }

  const message = await slackMessageUser(details.user.slackUser, {
    text,
    blocks,
  });
  if (message) {
    await saveSlackMessage(
      SlackMessage.PLEASE_DEPLOY,
      {
        refId: details.relevantCommit.sha,
        channel: `${message.channel}`,
        ts: `${message.ts}`,
      },
      {
        target: details.user.slackUser,
        status: 'undeployed',
        blocks,
        text,
      }
    );
  }
}

async function handler(event: EmitterWebhookEvent<'check_run'>) {
  if (!shouldProcessCheckRun(event)) {
    console.log(`Not processing check-run`);
    return;
  }

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'pleaseDeployNotifier',
  });

  Sentry.configureScope((scope) => scope.setSpan(tx));

  try {
    await postPleaseDeployMessage(event);
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  }

  tx.finish();
}

export async function pleaseDeployNotifier() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
  bolt.action(/gocd-deploy/, async ({ ack, body, context }) => {
    await ack();
    Sentry.withScope(async (scope) => {
      scope.setUser({
        id: body.user.id,
      });
      const tx = Sentry.startTransaction({
        op: 'slack.action',
        name: `gocd-deploy`,
      });
      tx.finish();
    });
  });

  // Handles both mute and unmute action that comes from deploy notification
  bolt.action(
    /(unmute|mute)-slack-deploy/,
    wrapHandler('actionSlackDeploy', actionSlackDeploy)
  );

  // Handles viewing undeployed commits
  bolt.action(
    /view-undeployed-commits-.*/,
    wrapHandler('actionViewUndeployedCommits', actionViewUndeployedCommits)
  );
}
