import { FREIGHT_URL } from '@app/config';

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
    url: `${FREIGHT_URL}/deploy?app=getsentry`,
    action_id: 'freight-deploy',
  };
}
