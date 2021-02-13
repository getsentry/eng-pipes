export function unmuteDeployNotificationsButton() {
  return {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'Un-mute',
      emoji: true,
    },
    value: 'unmute',
    action_id: 'unmute-slack-deploy',
  };
}
