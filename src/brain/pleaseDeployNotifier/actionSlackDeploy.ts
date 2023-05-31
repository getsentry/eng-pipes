import * as Sentry from '@sentry/node';

import { updateAppHome } from '../../api/slack/updateAppHome';
import { muteDeployNotificationsButton } from '../../blocks/muteDeployNotificationsButton';
import { unmuteDeployNotificationsButton } from '../../blocks/unmuteDeployNotificationsButton';
import { setUserPreference } from '../../utils/db/setUserPreference';

/**
 * Update an attachments block with new actions
 *
 * TODO(billy): This can be a bit more generic, but for now it just updates
 * an actions section within an attachments block
 */
function updateAttachment(
  attachments: any[],
  targetAttachmentId: number,
  oldActionFilter: (args: any) => boolean,
  newActions: any[]
) {
  // Need to find the attachment where the Mute button belongs to
  const attachment = attachments.find(({ id }) => id === targetAttachmentId);

  // Preserve other attachments if present
  const otherAttachments = attachments.filter(
    ({ id }) => id !== targetAttachmentId
  );

  // Find the actions section (this could be more generic)
  const actions = attachment.blocks.find(({ type }) => type === 'actions');

  // Preserve other blocks in the attachment
  const oldBlocks = attachment.blocks.filter(({ type }) => type !== 'actions');

  const newElements = [
    ...actions.elements.filter(oldActionFilter),
    ...newActions,
  ];

  return [
    ...otherAttachments,
    {
      ...attachment,
      blocks: [...oldBlocks, { ...actions, elements: newElements }],
    },
  ];
}

export async function actionSlackDeploy({ ack, body, client, context }) {
  const shouldMute = context.actionIdMatches[1] === 'mute';
  await ack();
  try {
    await setUserPreference(
      { slackUser: body.user.id },
      { disableSlackNotifications: shouldMute }
    );
  } catch (err) {
    console.error(err);
    Sentry.captureException(err);
    await client.chat.postEphemeral({
      channel: body.channel?.id || '',
      // @ts-ignore
      user: body.user.id,
      text: 'There was an error changing your deploy notification preferences',
    });
  }

  if (body.view) {
    updateAppHome(body.user.id);
    return;
  }

  /**
   * Update the message to hide Mute button and show Un-mute button.
   * This is needed if the user tries to mute/unmute from a message
   * with the (un)muteDeployNotificationsButtons shown as an action.
   */

  // @ts-ignore
  const { container, message } = body;
  const { ts, text, attachments } = message;

  // Update original message to change mute button to unmute
  await client.chat.update({
    channel: body.channel?.id || '',
    ts,
    text,
    attachments: updateAttachment(
      attachments,
      container.attachment_id,
      ({ action_id }) =>
        action_id !== `${context.actionIdMatches[1]}-slack-deploy`,
      [
        shouldMute
          ? unmuteDeployNotificationsButton()
          : muteDeployNotificationsButton(),
      ]
    ),
  });
}
