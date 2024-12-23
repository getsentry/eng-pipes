import '@sentry/tracing';

import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';

import { githubEvents } from '@/api/github';
import { getUpdatedGoCDDeployMessage } from '@/blocks/getUpdatedDeployMessage';
import { gocdDeploy } from '@/blocks/gocdDeploy';
import { muteDeployNotificationsButton } from '@/blocks/muteDeployNotificationsButton';
import { viewUndeployedCommits } from '@/blocks/viewUndeployedCommits';
import {
  Color,
  GETSENTRY_ORG,
  GETSENTRY_REPO_SLUG,
  GOCD_SENTRYIO_BE_PIPELINE_NAME,
  GOCD_SENTRYIO_FE_PIPELINE_NAME,
  SENTRY_REPO_SLUG,
} from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { getGoCDDeployForQueuedCommit } from '@/utils/db/getDeployForQueuedCommit';
import { getChangedStack } from '@/utils/github/getChangedStack';
import { getRelevantCommit } from '@/utils/github/getRelevantCommit';
import { getUser } from '@/utils/github/getUser';
import { isGetsentryRequiredCheck } from '@/utils/github/isGetsentryRequiredCheck';
import { INPROGRESS_MSG, READY_TO_DEPLOY } from '@/utils/gocd/gocdHelpers';
import { wrapHandler } from '@/utils/misc/wrapHandler';
import { getBlocksForCommit } from '@/utils/slack/getBlocksForCommit';
import { slackMessageUser } from '@/utils/slack/slackMessageUser';
import { bolt } from '@api/slack';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';

import { actionSlackDeploy } from './actionSlackDeploy';
import { actionViewUndeployedCommits } from './actionViewUndeployedCommits';

async function getGoCDDeployBlock(deployInfo, user): Promise<KnownBlock[]> {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: getUpdatedGoCDDeployMessage({
          isUserDeploying: deployInfo.stage_approved_by === user.email,
          slackUser: user.slackUser,
          pipeline: deployInfo,
        }),
      },
    },
  ];
}

async function currentDeployBlocks(
  checkRun,
  user,
  isFrontendOnly
): Promise<KnownBlock[] | null> {
  // Look for queued commits and see if current commit is queued
  let pipeline_name = GOCD_SENTRYIO_BE_PIPELINE_NAME;
  if (isFrontendOnly) {
    pipeline_name = GOCD_SENTRYIO_FE_PIPELINE_NAME;
  }
  const gocdDeployInfo = await getGoCDDeployForQueuedCommit(
    checkRun.head_sha,
    pipeline_name
  );
  if (gocdDeployInfo) {
    return getGoCDDeployBlock(gocdDeployInfo, user);
  }

  return null;
}

async function handler({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'check_run'>) {
  // Make sure this is on `getsentry` and we are examining the aggregate "required check" run
  if (!isGetsentryRequiredCheck({ id, payload, ...rest })) {
    return;
  }

  const { check_run: checkRun } = payload;

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // Ignore non-"successful" conclusions
  if (checkRun.conclusion !== 'success') {
    return;
  }

  // Find the author of the commit, we should probably link both getsentry? and sentry?
  const relevantCommit = await getRelevantCommit(checkRun.head_sha);

  if (!relevantCommit) {
    Sentry.setContext('checkRun', {
      head_sha: checkRun.head_sha,
    });
    Sentry.captureException(new Error('Unable to find commit'));
    return;
  }

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'pleaseDeployNotifier',
  });

  Sentry.configureScope((scope) => scope.setSpan(tx));

  // Message author on slack that their commit is ready to deploy
  // and send a link to start a deploy
  const user = await getUser({
    githubUser: relevantCommit.author?.login,
    email: relevantCommit.commit.author?.email,
  });

  if (!user?.slackUser) {
    Sentry.withScope(async (scope) => {
      scope.setUser({
        email: relevantCommit.commit.author?.email,
      });
      tx.setStatus('no-user');
      tx.finish();
    });
    return;
  }

  const slackTarget = user?.slackUser;

  const blocks = await getBlocksForCommit(relevantCommit);

  // Author of commit found
  const commit = checkRun.head_sha;
  const commitLink = `https://github.com/${GETSENTRY_ORG.slug}/${GETSENTRY_REPO_SLUG}/commits/${commit}`;
  const commitLinkText = `${commit.slice(0, 7)}`;

  // checkRun.head_sha will always be from getsentry, so if relevantCommit's
  // sha differs, it means that the relevantCommit is on the sentry repo
  const relevantCommitRepo =
    relevantCommit.sha === checkRun.head_sha
      ? GETSENTRY_REPO_SLUG
      : SENTRY_REPO_SLUG;
  const { isFrontendOnly, isFullstack } = await getChangedStack(
    relevantCommit.sha,
    relevantCommitRepo
  );

  let text = `Your commit getsentry@<${commitLink}|${commitLinkText}> ${READY_TO_DEPLOY}`;
  if (isFullstack) {
    text = `Your commit getsentry@<${commitLink}|${commitLinkText}> is a full stack change and ready to deploy on both the frontend and backend`;
  }

  // If the commit is already queued, add that message, otherwise
  // show actions to start the deploy / review it.
  const deployBlocks = await currentDeployBlocks(
    checkRun,
    user,
    isFrontendOnly
  );
  if (deployBlocks) {
    text = `Your commit getsentry@<${commitLink}|${commitLinkText}> ${INPROGRESS_MSG}`;
    blocks.push(...deployBlocks);
  } else {
    blocks.push({
      type: 'actions',
      elements: [
        gocdDeploy(commit),
        viewUndeployedCommits(commit),
        muteDeployNotificationsButton(),
      ],
    });
  }

  const message = await slackMessageUser(slackTarget, {
    text,
    attachments: [
      {
        color: Color.OFF_WHITE_TOO,
        blocks,
      },
    ],
  });

  if (message) {
    await saveSlackMessage(
      SlackMessage.PLEASE_DEPLOY,
      {
        refId: commit,
        channel: `${message.channel}`,
        ts: `${message.ts}`,
      },
      {
        target: slackTarget,
        status: 'undeployed',
        blocks,
        text,
      }
    );
  }

  Sentry.withScope(async (scope) => {
    scope.setUser({
      id: slackTarget,
      email: relevantCommit.commit.author?.email,
    });
    tx.finish();
  });
}

export async function pleaseDeployNotifier() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
  bolt.action(/gocd-deploy/, async ({ ack, body }) => {
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
