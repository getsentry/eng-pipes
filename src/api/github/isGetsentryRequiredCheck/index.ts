import { EmitterWebhookEvent } from '@octokit/webhooks';

import {
  GETSENTRY_ORG,
  GETSENTRY_REPO_SLUG,
  REQUIRED_CHECK_NAME,
} from '~/config';

/**
 * Checks payload to see if:
 * 1) This is from the getsentry repo
 * 2) Check run is completed
 * 3) This is the aggregated "required check" Check Run
 */
export function isGetsentryRequiredCheck({
  payload,
}: EmitterWebhookEvent<'check_run'>) {
  // Only on `getsentry` repo
  if (
    payload.repository?.full_name !==
    `${GETSENTRY_ORG.slug}/${GETSENTRY_REPO_SLUG}`
  ) {
    return false;
  }

  const { check_run: checkRun } = payload;

  // Only care about completed checks
  if (checkRun.status !== 'completed') {
    return false;
  }

  if (checkRun.name !== REQUIRED_CHECK_NAME) {
    return false;
  }

  return true;
}
