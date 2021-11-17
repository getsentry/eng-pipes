import * as Sentry from '@sentry/node';

import { FreightPayload } from '@types';

import { getUpdatedDeployMessage } from '@/blocks/getUpdatedDeployMessage';
import { Color, GETSENTRY_REPO, OWNER } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { clearQueuedCommits } from '@/utils/db/clearQueuedCommits';
import { queueCommitsForDeploy } from '@/utils/db/queueCommitsForDeploy';
import { freight } from '@api/freight';
import { getUser } from '@api/getUser';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { getSlackMessage } from '@utils/db/getSlackMessage';

/**
 * This handler listens to Freight for deploys of `getsentry` to production.
 * Users receive a Slack notification when their commit passes CI and is ready
 * to deploy.  This will update those Slack messages telling them that their
 * commit has been queued to be deployed (if applicable).
 *
 * (Exported for tests)
 */
export async function handler(payload: FreightPayload) {
  if (
    payload.environment !== 'production' &&
    payload.app_name === 'getsentry'
  ) {
    return;
  }

  const tx = Sentry.startTransaction({
    op: 'brain',
    name: 'updateDeployNotifications',
  });
  Sentry.configureScope((scope) => scope.setSpan(tx));

  // Get the range of commits for this payload
  const getsentry = await getClient('getsentry');

  /**
   * Note this will not include `base`, but *does* include `head`.
   * Also `commits` is empty if `status` == 'behind'
   */
  const { data } = await getsentry.repos.compareCommits({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    head: payload.sha,
    base: payload.previous_sha,
  });

  const commitShas = data.commits.map(({ sha }) => sha);

  // Look for associated slack messages based on getsentry commit sha
  const messages = await getSlackMessage(
    SlackMessage.PLEASE_DEPLOY,
    commitShas
  );
  const { status } = payload;

  const progressText =
    status === 'queued'
      ? 'is queued for deployment'
      : status === 'started'
      ? 'is being deployed'
      : status === 'finished'
      ? 'was deployed'
      : status === 'failed'
      ? 'failed to deploy'
      : '';
  const progressColor =
    status === 'queued'
      ? Color.OFF_WHITE_TOO
      : status === 'started'
      ? Color.SUCCESS_LIGHT
      : status === 'finished'
      ? Color.SUCCESS
      : Color.DANGER;

  const queuePromise =
    status === 'queued'
      ? queueCommitsForDeploy(data.commits)
      : status === 'finished'
      ? clearQueuedCommits(payload.sha)
      : null;

  const promises: Promise<any>[] = messages.map(async (message) => {
    const updatedBlocks = message.context.blocks.slice(0, -1);
    const payloadUser = await getUser({ email: payload.user });
    const isUserDeploying = message.context.target === payloadUser?.slackUser;

    const updatedDeployMessage = getUpdatedDeployMessage({
      isUserDeploying,
      payload,
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
    //
    return await Promise.all([
      // Currently, we ignore deploy errors so they will just see the original messages
      // with the actions to deploy
      //
      // Update original message body with deploy status
      bolt.client.chat.update({
        ts: message.ts,
        channel: message.channel,
        text: !progressText
          ? progressText
          : message.context.text.replace('is ready to deploy', progressText),
        attachments: [
          {
            color: progressColor,
            blocks: !progressText ? message.context.blocks : updatedBlocks,
          },
        ],
      }),

      // We want to thread a message only when the commit is deployed
      ...(status === 'finished'
        ? [
            bolt.client.chat.postMessage({
              thread_ts: message.ts,
              channel: message.channel,
              text: `${
                message.context.target
                  ? `<@${message.context.target}>, your`
                  : 'Your'
              } commit has been deployed. *Note* This message from Sentaur is now deprecated as this feature is now native to Sentry. Please <https://sentry.io/settings/account/notifications/deploy/|configure your Sentry deploy notifications here> to turn on Slack deployment notifications`,
            }),
          ]
        : []),
    ]);
  });

  try {
    await Promise.all([...promises, queuePromise]);
  } catch (err) {
    Sentry.captureException(err);
    console.error(err);
  }

  Sentry.withScope((scope) => {
    scope.setContext('freight', {
      ...payload,
      title: 'freight',
      description: payload.title,
      commits: commitShas,
      updatedMessages: messages.map((m) => m.channel),
    });

    tx.finish();
  });
}

export async function updateDeployNotifications() {
  freight.on('*', handler);

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
