import { FastifyRequest } from 'fastify';

import { FreightPayload } from '@types';

import { getSentryPullRequestsForGetsentryRange } from '@api/github/getSentryPullRequestsForGetsentryRange';
import { insert, mapDeployToPullRequest } from '@utils/metrics';

export async function handler(request: FastifyRequest) {
  const { body }: { body: FreightPayload } = request;
  let promises: Promise<any>[] = [];

  const { environment } = body;
  let { status } = body;

  // Need to wait for this to be deployed/merged https://github.com/getsentry/freight/pull/231
  // In the meantime we can parse title for the status
  //
  // After the PR is deployed, body.status is a string (vs a stringified int) and
  // we will have NaN !== NaN, so the below will be skipped
  if (parseInt(body.status) === parseInt(body.status)) {
    if (status === '2') {
      status = 'queued';
    } else if (status === '0') {
      status = 'started';
    } else {
      status = body.title.includes('Successfully finished')
        ? 'finished'
        : body.title.includes('Failed to finish')
        ? 'failed'
        : 'canceled';
    }
  }

  if (environment !== 'production') {
    return {};
  }

  // Wait for actual data before inserting into db
  promises.push(
    insert({
      source: 'freight',
      event: `deploy_${status}`,
      object_id: null,
      source_id: body.deploy_number,
      start_timestamp: body.date_started,
      // `finished_at` is null when it has not completed yet
      end_timestamp: body.date_finished,
      meta: {
        app: body.app_name,
        head_commit: body.sha,
        base_commit: body.previous_sha,
      },
    })
  );

  // If we have the previous sha, then look up the list of commits (in getsentry) between
  // current and previous sha. Use this list of commits to find the corresponding commits/prs in sentry
  //
  // Only do this step if deploy is successful
  //
  // TODO: figure out how rollbacks will affect this data
  if (body.previous_sha && status === 'finished') {
    const sentryPullRequests = await getSentryPullRequestsForGetsentryRange(
      body.sha,
      body.previous_sha
    );

    // insert these into a different table that maps freight deploys to the pr
    promises = [
      ...promises,
      ...sentryPullRequests.map((pr) =>
        mapDeployToPullRequest(
          body.deploy_number,
          pr.number,
          pr.merge_commit_sha
        )
      ),
    ];
  }

  await Promise.all(promises);

  return {};
}
