export function freightDeploy(commit: string) {
  return {
    type: 'button',
    style: 'primary',
    text: {
      type: 'plain_text',
      text: 'Deploy',
      emoji: true,
    },
    value: commit,
    url: 'https://freight.getsentry.net/deploy?app=getsentry',
    action_id: 'freight-deploy',
  };
}
