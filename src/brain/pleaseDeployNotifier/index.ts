import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';

import { githubEvents } from '@/api/github';
import { getChangedStack } from '@/api/github/getChangedStack';
import { freightDeploy } from '@/blocks/freightDeploy';
import {
  getUpdatedDeployMessage,
  getUpdatedGoCDDeployMessage,
} from '@/blocks/getUpdatedDeployMessage';
import { gocdDeploy } from '@/blocks/gocdDeploy';
import { muteDeployNotificationsButton } from '@/blocks/muteDeployNotificationsButton';
import { viewUndeployedCommits } from '@/blocks/viewUndeployedCommits';
import { Color, GETSENTRY_REPO, OWNER, SENTRY_REPO } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import {
  getFreightDeployForQueuedCommit,
  getGoCDDeployForQueuedCommit,
} from '@/utils/db/getDeployForQueuedCommit';
import { INPROGRESS_MSG, READY_TO_DEPLOY } from '@/utils/gocdHelpers';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getUser } from '@api/getUser';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { isGetsentryRequiredCheck } from '@api/github/isGetsentryRequiredCheck';
import { bolt } from '@api/slack';
import { slackMessageUser } from '@api/slackMessageUser';
import { saveSlackMessage } from '@utils/db/saveSlackMessage';
import { wrapHandler } from '@utils/wrapHandler';

import { actionSlackDeploy } from './actionSlackDeploy';
import { actionViewUndeployedCommits } from './actionViewUndeployedCommits';

async function getFreightDeployBlock(
  freightDeployInfo,
  user
): Promise<KnownBlock[]> {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: getUpdatedDeployMessage({
          isUserDeploying: freightDeployInfo.user == user.email,
          payload: {
            ...freightDeployInfo,
            deploy_number: freightDeployInfo.external_id,
          },
        }),
      },
    },
  ];
}

async function getGoCDDeployBlock(deployInfo, user): Promise<KnownBlock[]> {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: getUpdatedGoCDDeployMessage({
          isUserDeploying: deployInfo.stage_approved_by == user.email,
          slackUser: user.slackUser,
          pipeline: deployInfo,
        }),
      },
    },
  ];
}

async function currentDeployBlocks(
  checkRun,
  user
): Promise<KnownBlock[] | null> {
  // Look for queued commits and see if current commit is queued
  const freightDeployInfo = await getFreightDeployForQueuedCommit(
    checkRun.head_sha
  );
  if (freightDeployInfo) {
    return getFreightDeployBlock(freightDeployInfo, user);
  }

  const gocdDeployInfo = await getGoCDDeployForQueuedCommit(checkRun.head_sha);
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
  // and send a link to open freight
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

  // checkRun.head_sha will always be from getsentry, so if relevantCommit's
  // sha differs, it means that the relevantCommit is on the sentry repo
  const relevantCommitRepo =
    relevantCommit.sha === checkRun.head_sha ? GETSENTRY_REPO : SENTRY_REPO;

  // If the commit contains only frontend changes, link user to deploy the
  // `getsentry-frontend` Freight app
  const { isFrontendOnly } = await getChangedStack(
    relevantCommit.sha,
    relevantCommitRepo
  );

  const blocks = await getBlocksForCommit(relevantCommit);

  // Author of commit found
  const commit = checkRun.head_sha;
  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${commit}`;
  const commitLinkText = `${commit.slice(0, 7)}`;
  let text = `Your commit getsentry@<${commitLink}|${commitLinkText}> ${READY_TO_DEPLOY}`;

  // If the commit is already queued, add that message, otherwise
  // show actions to start the deploy / review it.
  const deployBlocks = await currentDeployBlocks(checkRun, user);
  if (deployBlocks) {
    text = `Your commit getsentry@<${commitLink}|${commitLinkText}> ${INPROGRESS_MSG}`;
    blocks.push(...deployBlocks);
  } else {
    let deployElement = gocdDeploy(commit);

    // TODO (matt.gaunt): When GoCD backend is deploying from GoCD we should
    // Remove this if statement
    if (!isFrontendOnly) {
      deployElement = freightDeploy(commit, 'getsentry-backend');
    }

    blocks.push({
      type: 'actions',
      elements: [
        deployElement,
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

  // We need to respond to button clicks, otherwise it will display a warning message
  bolt.action(/freight-deploy:(.*)/, async ({ ack, body, context }) => {
    await ack();
    Sentry.withScope(async (scope) => {
      scope.setUser({
        id: body.user.id,
      });
      const tx = Sentry.startTransaction({
        op: 'slack.action',
        name: `freight-deploy: ${context.actionIdMatches[1]}`,
      });
      tx.finish();
    });
    // TODO(billy): Call freight API directly to deploy
  });
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
