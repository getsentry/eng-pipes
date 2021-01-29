import { EventPayloads } from '@octokit/webhooks';

import { insert } from '@utils/db';
import { githubEvents } from '@api/github';

const CHECK_STATUS_MAP = {
  in_progress: 'started',
  failure: 'failed',
  success: 'passed',
  cancelled: 'canceled',
};

function handler({
  name: eventName,
  payload,
}: {
  name: string;
  payload: EventPayloads.WebhookPayloadCheckRun;
}) {
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
  insert({
    source: 'github',
    event: `build_${status}`,
    object_id: pullRequest?.number,
    source_id: payloadObj.id,
    start_timestamp: payloadObj.started_at,
    // can be null if it has not completed yet
    end_timestamp: payloadObj.completed_at || null,
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
export async function metrics() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
}
