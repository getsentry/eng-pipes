import { EmitterWebhookEvent } from '@octokit/webhooks';

import { GETSENTRY_REPO, OWNER } from '@/config';

/**
 * Given a CheckRun, returns a Slack message string that is split up into a list so that you can opt to replace pieces of the message
 *
 * @param checkRun CheckRun from GitHub
 */
export function getTextParts(
  checkRun: EmitterWebhookEvent<'check_run'>['payload']['check_run']
) {
  const commitLink = `https://github.com/${OWNER}/${GETSENTRY_REPO}/commits/${checkRun.head_sha}`;
  const commitLinkText = `${checkRun.head_sha.slice(0, 7)}`;
  const buildLink = `<${checkRun.html_url}|View Build>`;

  return [
    `${GETSENTRY_REPO}@master`,
    `<${commitLink}|${commitLinkText}>`,
    `is failing`,
    `(${buildLink})`,
  ];
}