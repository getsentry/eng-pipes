import { GOCD_ORIGIN } from '@/config';

export function gocdDeployBlock(
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
    url: `${GOCD_ORIGIN}`,
    action_id: `gocd-deploy: ${app}`,
  };
}
