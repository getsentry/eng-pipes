import { GETSENTRY_ORG, GETSENTRY_REPO_SLUG } from '@/config';
import { CheckRunForRequiredChecksText } from '@/types/github';

/**
 * Given a CheckRun, returns a Slack message string that is split up into a list so that you can opt to replace pieces of the message
 *
 * @param checkRun CheckRun from GitHub
 */
export function getTextParts(checkRun: CheckRunForRequiredChecksText) {
  const commitLink = `https://github.com/${GETSENTRY_ORG.slug}/${GETSENTRY_REPO_SLUG}/commits/${checkRun.head_sha}`;
  const commitLinkText = `${checkRun.head_sha.slice(0, 7)}`;
  const buildLink = `<${checkRun.html_url}|View Build>`;

  return [
    `${GETSENTRY_REPO_SLUG}@master`,
    `<${commitLink}|${commitLinkText}>`,
    `is failing`,
    `(${buildLink})`,
  ];
}
