export function freightDeploy(
  commit: string,
  app: 'getsentry-backend' | 'getsentry-frontend' = 'getsentry-backend'
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
