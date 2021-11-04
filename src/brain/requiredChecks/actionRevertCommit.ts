import {
  AllMiddlewareArgs,
  BlockButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';

export async function actionRevertCommit({
  ack,
  action,
  body,
  client,
  payload,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockButtonAction>) {
  await ack();

  const metadata = JSON.parse(payload.value);
  const { sha, repo } = metadata;

  // Open a "loading" modal so that we can respond as soon as possible
  await client.views.open({
    // Pass a valid trigger_id within 3 seconds of receiving it
    // @ts-ignore Slack types suxx
    trigger_id: body.trigger_id,
    // View payload
    view: {
      type: 'modal',
      // View identifier
      callback_id: 'revert-commit-confirm',
      private_metadata: JSON.stringify({
        ...metadata,
        // Need to save reference to original message so we can remove the
        // "Revert" button, once the commit is sucessfully reverted
        originalMessage: {
          message: body.message,
          channel: body.container.channel_id,
          attachmentId: body.container.attachment_id,
          revertBlockId: action.block_id,
        },
      }),
      title: {
        type: 'plain_text',
        text: `Revert Commit`,
      },
      submit: {
        type: 'plain_text',
        text: 'Proceed with Revert',
        emoji: true,
      },
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Are you sure you want to revert commit?',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:warning: You are attempting to revert commit <https://github.com/getsentry/${repo}/commit/${sha}|${sha}>.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Please make sure this is the correct commit as the revert will be pushed directly to \`master\`, bypassing CI checks. This should only be used if you have landed a change that is breaking production, or breaking CI.`,
          },
        },
      ],
    },
  });
}
