import * as Sentry from '@sentry/node';
import {
  AllMiddlewareArgs,
  SlackViewAction,
  SlackViewMiddlewareArgs,
} from '@slack/bolt';

import { revertCommit } from '@api/deploySyncBot/revertCommit';
import { getUser } from '@api/getUser';

export async function revertCommitConfirm({
  ack,
  view,
  body,
  client,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs<SlackViewAction>) {
  await ack();

  // Attribute the revert to the Slack user that initiated it
  const user = await getUser({
    slackUser: body.user.id,
  });

  // TODO: Do we need to check that user has permissions?
  const { originalMessage, ...commitData } = JSON.parse(view.private_metadata);

  // Notify the user in the original message thread that we are attempting to revert
  const loadingMessage = await client.chat.postMessage({
    channel: originalMessage.channel,
    thread_ts: originalMessage.message.ts,
    text: `<@${body.user.id}>, :sentry-loading: we are attempting to revert the commit... :sentry-loading:`,
  });

  try {
    await revertCommit({
      ...commitData,
      name: `${body.user.name} via Slack${user ? ` <${user.email}>` : ''}`,
    });
  } catch (err) {
    // Update the loading message with error message
    await Promise.all([
      client.chat.delete({
        channel: originalMessage.channel,
        ts: `${loadingMessage.ts}`,
      }),
      client.chat.postMessage({
        channel: originalMessage.channel,
        thread_ts: `${originalMessage.message.ts}`,
        text: `<@${body.user.id}>, there was an error reverting the commit.`,
      }),
    ]);

    console.error(err);
    Sentry.captureException(err);
    return;
  }

  // Update the loading message with success message
  await Promise.all([
    client.chat.delete({
      channel: originalMessage.channel,
      ts: `${loadingMessage.ts}`,
    }),
    client.chat.postMessage({
      channel: originalMessage.channel,
      thread_ts: `${originalMessage.message.ts}`,
      text: `<@${body.user.id}>, the commit has been reverted :successkid:`,
    }),
  ]);

  // We semi-assume there is only one attachments block as we will not
  // update any other attachments.
  //
  // Ignore `id` and `fallback` properties
  const {
    id: _id,
    fallback: _fallback,
    ...attachment
  } = originalMessage.message.attachments.find(
    ({ id }) => String(id) === String(originalMessage.attachmentId)
  );

  // Remove the actions block where the Revert button is as it will be the only
  // element there
  const updatedBlocks = attachment.blocks.filter(
    ({ block_id }) => block_id !== originalMessage.revertBlockId
  );

  // Find original message to remove the Revert button
  // @ts-ignore - `text` is not actually required
  await client.chat.update({
    channel: originalMessage.channel,
    ts: originalMessage.message.ts,
    attachments: [
      {
        ...attachment,
        blocks: [
          ...updatedBlocks,
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Update* Commit reverted by <@${body.user.id}>`,
            },
          },
        ],
      },
    ],
  });
}
