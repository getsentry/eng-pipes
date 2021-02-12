export function muteDeployNotificationsButton() {
  return {
    type: 'button',
    style: 'danger',
    text: {
      type: 'plain_text',
      text: 'Mute',
      emoji: true,
    },
    action_id: 'mute-slack-deploy',
    value: 'mute',
    confirm: {
      title: {
        type: 'plain_text',
        text: 'Mute deploy notifications?',
      },
      text: {
        type: 'mrkdwn',
        text:
          'Are you sure you want to mute these deploy notifications? You can re-enable them by DM-ing me `deploy notifications on`',
      },
      confirm: {
        type: 'plain_text',
        text: 'Mute',
      },
      deny: {
        type: 'plain_text',
        text: 'Cancel',
      },
    },
  };
}
