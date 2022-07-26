export function freightDeploy(
  commit: string,
  app: 'z-getsentry-deprecated' | 'getsentry-frontend' = 'z-getsentry-deprecated'
) {
  return {
    type: 'button',
    style: 'primary',
    text: {
      type: 'plain_text',
      text: 'Deploy',
      emoji: true,
    },
    value: commit,
    url: `https://freight.getsentry.net/deploy?app=${app}`,
    action_id: `freight-deploy: ${app}`,
  };
}
