import * as Sentry from '@sentry/node';

import { FreightPayload } from '@types';

import { Color, GETSENTRY_REPO, OWNER } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { freight } from '@api/freight';
import { getUser } from '@api/getUser';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { getSlackMessage } from '@utils/db/getSlackMessage';

function getUpdatedDeployMessage({
  isUserDeploying,
  payload,
}: {
  isUserDeploying: boolean;
  payload: FreightPayload;
}) {
  const { deploy_number, status, user, duration, link, title } = payload;
  // You have, user has
  const verbByStatus = {
    true: {
      queued: 'You have',
      started: 'You are',
      finished: 'You have',
    },
    false: {
      queued: `${user} has`,
      started: `${user} is`,
      finished: `${user} has`,
    },
  };

  const subject =
    verbByStatus[`${!!isUserDeploying}`][status] ??
    // Otherwise it has failed
    (isUserDeploying ? `You have` : `${user} has`);

  const slackLink = `<${link}|#${deploy_number}>`;

  if (status === 'queued') {
    return `${subject} queued this commit for deployment (${slackLink})`;
  }

  if (status === 'started') {
    return `${subject} deploying this commit (${slackLink})`;
  }

  if (status === 'finished') {
    return `${subject} finished deploying this commit (${slackLink}) after ${duration} seconds`;
  }

  // Otherwise it failed to deploy, show the Freight summary
  return `${subject} failed to deploy this commit (${slackLink})

> ${title}
`;
}

// Exported for tests
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
      : '';
  const progressColor =
    status === 'queued'
      ? Color.OFF_WHITE_TOO
      : status === 'started'
      ? Color.SUCCESS_LIGHT
      : status === 'finished'
      ? Color.SUCCESS
      : Color.DANGER;

  const promises = messages.map(async (message) => {
    const updatedBlocks = message.context.blocks.slice(0, -1);
    const payloadUser = await getUser({ email: payload.user });
    const isUserDeploying =
      message.context.target &&
      message.context.target === payloadUser?.slackUser;

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
              } commit has been deployed. **Note** This message is now deprecated as this feature is now native to Sentry. <https://sentry.io/settings/account/notifications/|Configure your Sentry deploy notifications here>`,
            }),
          ]
        : []),
    ]);
  });

  try {
    await Promise.all(promises);
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
  freight.off('*', handler);
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
