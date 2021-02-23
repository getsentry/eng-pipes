import * as Sentry from '@sentry/node';

import { FreightPayload } from '@types';

import { Color, GETSENTRY_REPO, OWNER } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { freight } from '@api/freight';
import { getUser } from '@api/getUser';
import { getClient } from '@api/github/getClient';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

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
    verbByStatus[`${isUserDeploying}`][status] ??
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

  // Get the range of commits for this payload
  const getsentry = await getClient('getsentry', 'getsentry');

  const { data } = await getsentry.repos.compareCommits({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    head: payload.sha,
    base: payload.previous_sha,
  });

  const commitShas = data.commits.map(({ sha }) => sha);

  // Look for associated slack messages based on getsentry commit sha
  const messages = await db('slack_messages')
    .where({
      type: SlackMessage.PLEASE_DEPLOY,
    })
    .whereIn('refId', commitShas);
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
      ? Color.NEUTRAL
      : status === 'started'
      ? Color.SUCCESS_LIGHT
      : status === 'finished'
      ? Color.SUCCESS
      : Color.DANGER;

  const tx = Sentry.startTransaction({
    op: 'handler',
    name: 'updateDeployNotifications',
  });

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

    // Currently, we ignore deploy errors so they will just see the original messages
    // with the actions to deploy
    return await bolt.client.chat.update({
      channel: message.ts,
      ts: message.ts,
      text: !progressText
        ? progressText
        : message.context.text.replace('is ready to deploy', progressText),
      attachments: [
        {
          color: progressColor,
          blocks: !progressText ? message.context.blocks : updatedBlocks,
        },
      ],
    });
  });

  await Promise.all(promises);

  Sentry.withScope((scope) => {
    scope.setContext('freight', {
      ...payload,
      title: 'freight',
      description: payload.title,
      commits: commitShas,
    });

    tx.finish();
  });
}

export async function updateDeployNotifications() {
  freight.off('*', handler);
  freight.on('*', handler);
}
