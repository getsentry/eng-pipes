import { DEPLOY_TOOLS_ORIGIN } from '@/config';

/**
 * Button linking to deploy-tools, where the automatic getsentry rollout can be
 * tracked. If a pipeline group is known, deep-link to that service, otherwise
 * link to the deploy-tools root.
 */
export function viewInDeployTools(group?: string) {
  return {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'View in deploy-tools',
      emoji: true,
    },
    url: group
      ? `${DEPLOY_TOOLS_ORIGIN}/services/${group}`
      : DEPLOY_TOOLS_ORIGIN,
    action_id: `view-in-deploy-tools`,
  };
}
