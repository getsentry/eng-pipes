import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';
import { Octokit } from '@octokit/rest';

import {
  OWNER,
  SENTRY_REPO,
  GETSENTRY_REPO,
  GETSENTRY_BOT_ID,
} from '../../config';
import { getClient } from './getClient';

const octokit = new Octokit();

type CommitsResponseDataType = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.compareCommits
>;
type PullRequest = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.listPullRequestsAssociatedWithCommit
>;

/**
 * Given 2 SHA's in getsentry, get all commits (in sentry) in between the 2 given SHAs
 *
 * Does not include commits that originate in getsentry
 */
export async function getSentryPullRequestsForGetsentryRange(
  current: string,
  previous: string
): Promise<PullRequest[number][]> {
  // getsentry client
  const client = await getClient(OWNER, GETSENTRY_REPO);

  const resp = await client.repos.compareCommits({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    base: previous,
    head: current,
  });

  if (resp.status !== 200) {
    throw new Error('API Error: comparing commits');
  }

  const { data } = resp;

  function getSentrySha(commit: CommitsResponseDataType['commits'][number]) {
    return commit.commit.message.replace('getsentry/sentry@', '').slice(0, 40);
  }

  // Only look for synced commits from sentry
  // (e.g. where `getsentry-bot` is the committer)
  const syncedCommits = data.commits.filter(
    ({ committer }) => committer.id === GETSENTRY_BOT_ID
  );
  const sentryShas = syncedCommits.map(getSentrySha);

  const sentry = await getClient(OWNER, SENTRY_REPO);

  const pullRequestPromises = sentryShas.map(commit_sha =>
    sentry.repos.listPullRequestsAssociatedWithCommit({
      owner: OWNER,
      repo: SENTRY_REPO,
      commit_sha,
    })
  );

  const pullRequests = await Promise.all(pullRequestPromises);

  return pullRequests.map(({ data }) => data?.[0]);
}
