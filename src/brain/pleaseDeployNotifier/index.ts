import { EmitterWebhookEvent } from '@octokit/webhooks';
import * as Sentry from '@sentry/node';

import { githubEvents } from '@/api/github';
import { freightDeploy } from '@/blocks/freightDeploy';
import { muteDeployNotificationsButton } from '@/blocks/muteDeployNotificationsButton';
import { Color, GETSENTRY_REPO, OWNER } from '@/config';
import { getBlocksForCommit } from '@api/getBlocksForCommit';
import { getUser } from '@api/getUser';
import { getRelevantCommit } from '@api/github/getRelevantCommit';
import { isGetsentryRequiredCheck } from '@api/github/isGetsentryRequiredCheck';
import { bolt } from '@api/slack';
import { slackMessageUser } from '@api/slackMessageUser';
import { wrapHandler } from '@utils/wrapHandler';

import { actionSlackDeploy } from './actionSlackDeploy';

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
    op: 'handler',
    name: 'pleaseDeployNotifier',
  });

  // Message author on slack that they're commit is ready to deploy
  // and send a link to open freight
  const user = await getUser({
    githubUser: relevantCommit.author?.login,
    email: relevantCommit.commit.author?.email,
  });

  if (!user?.slackUser) {
    tx.finish();
    return;
  }

  const slackTarget = user?.slackUser;
  console.log({ slackTarget });

  // Author of commit found
  const commitBlocks = getBlocksForCommit(relevantCommit);
  const commit = checkRun.head_sha;
  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${commit}`;
  const commitLinkText = `${commit.slice(0, 7)}`;
  const text = `Your commit getsentry@<${commitLink}|${commitLinkText}> is ready to deploy`;

  await slackMessageUser(slackTarget, {
    text,
    attachments: [
      {
        color: Color.NEUTRAL,
        blocks: [
          ...commitBlocks,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `This is currently alpha™, please leave feedback in #discuss-dev-tooling`,
            },
          },

          {
            type: 'actions',
            elements: [freightDeploy(commit), muteDeployNotificationsButton()],
          },
        ],
      },
    ],
  });

  // TODO(billy): Deploy directly, save user + sha in db state,
  // Follow up messages with commits that are being deployed
  // Tag people whose commits are being deployed
  tx.finish();
}

export async function pleaseDeployNotifier() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);

  // We need to respond to button clicks, otherwise it will display a warning message
  bolt.action('freight-deploy', async ({ ack }) => {
    // ack asap
    await ack();
    // TODO(billy): Call freight API directly to deploy
  });

  // Handles both mute and unmute action that comes from deploy notification
  bolt.action(
    /(unmute|mute)-slack-deploy/,
    wrapHandler('actionSlackDeploy', actionSlackDeploy)
  );
}
