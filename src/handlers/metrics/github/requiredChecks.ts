import { FastifyRequest } from 'fastify';

import { OWNER, GETSENTRY_REPO } from '../../../config';

import { getClient } from '../../../api/github/getClient';
import { getSentryPullRequestsForGetsentryRange } from '../../../api/github/getSentryPullRequestsForGetsentryRange';

const OK_CONCLUSIONS = ['success', 'neutral', 'skipped'];

export async function requiredChecks(request: FastifyRequest) {
  const { 'x-github-event': eventType } = request.headers;
  const { body: payload } = request;

  const ref = 'c448439758e9c94d6ac61be1ab09e69109b4c124';
  const resp = await getSentryPullRequestsForGetsentryRange(ref);
  console.log({ resp });

  const octokit = await getClient(OWNER, GETSENTRY_REPO);

  try {
    const { data: checks } = await octokit.checks.listForRef({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      ref,
    });
    console.log({
      checks: checks.check_runs
        .map((check) => ({
          id: check.id,
          html_url: check.html_url,
          status: check.status,
          conclusion: check.conclusion,
          name: check.name,
          started_at: check.started_at,
          completed_at: check.completed_at,
          duration:
            (+new Date(check.completed_at) - +new Date(check.started_at)) /
            1000,
        }))
        .filter(({ conclusion }) => !OK_CONCLUSIONS.includes(conclusion)),
    });
  } catch (err) {
    // console.error(err);
  }

  // Only look at `check_run` events and only on `getsentry` repo
  // if (eventType !== 'check_run' || payload.repository?.full_name !== 'getsentry/getsentry') {
  if (eventType !== 'check_run') {
    return;
  }

  const { check_run } = payload;
  const payloadObj = check_run;

  // Only care about completed checks
  if (payloadObj.status !== 'completed') {
    return;
  }

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // Ignore "successful" conclusions
  if (OK_CONCLUSIONS.includes(payloadObj.conclusion)) {
    return;
  }

  // Otherwise, there is a failed check
  // Need to notify channel that the build has failed
  // We need to include:
  // 1) A link to the getsentry commit
  //   1a) a link to the sentry commit if possible
  // 2) The author of the failed commit (will need to lookup their slack user from their gh email)
  // 3) A list of the failed checks (job name, duration, status)
  // 4) Button to re-run job
  console.log({
    sha: payloadObj.head_sha,
    repo: payload.repository?.full_name,
  });
}
