import { EmitterWebhookEvent } from '@octokit/webhooks';

import { insert } from '~/utils/metrics';

const CHECK_STATUS_MAP = {
  in_progress: 'started',
  failure: 'failed',
  success: 'passed',
  cancelled: 'canceled',
};

/**
 * GitHub webhook handler for sentry + getsentry repo metrics
 */
export async function sentryMetrics({
  name: eventName,
  payload,
}: EmitterWebhookEvent<'check_run'>) {
  const { check_run } = payload;
  // The status is based on the combination of the conclusion and status
  const payloadObj = check_run;
  const key = payloadObj.conclusion || payloadObj.status;
  const status = CHECK_STATUS_MAP[key] || key;

  // These can include forks, so we need to filter
  const [pullRequest] = payloadObj.pull_requests.filter(
    (pr) =>
      pr.url.startsWith(
        'https://api.github.com/repos/getsentry/sentry/pulls'
      ) ||
      pr.url.startsWith(
        'https://api.github.com/repos/getsentry/getsentry/pulls'
      )
  );
  return await insert({
    source: 'github',
    event: `build_${status}`,
    object_id: pullRequest?.number,
    source_id: payloadObj.id,
    start_timestamp: payloadObj.started_at,
    // can be null if it has not completed yet
    end_timestamp: payloadObj.completed_at || null,
    sha: payloadObj.head_sha,
    meta: {
      type: eventName,
      name: payloadObj.name || payloadObj.app?.name,
      head_commit: payloadObj.head_sha,
      base_commit: pullRequest?.base.sha,
      repo: payload.repository?.full_name,
      branch: payloadObj.check_suite.head_branch,
    },
  });
}
