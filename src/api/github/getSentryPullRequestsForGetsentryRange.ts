import { Octokit } from '@octokit/rest';
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';

import { GETSENTRY_BOT_ID, GETSENTRY_REPO, OWNER, SENTRY_REPO } from '@/config';

import { getClient } from './getClient';

const octokit = new Octokit();

type PullRequest = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.listPullRequestsAssociatedWithCommit
>;

function isGetsentryBot({ committer }) {
  return (
    committer?.id === GETSENTRY_BOT_ID ||
    committer?.email === 'bot@getsentry.com'
  );
}

function isNotGetsentryBot({ committer }) {
  return !isGetsentryBot({ committer });
}

function getSentrySha(message: string) {
  return message.replace('getsentry/sentry@', '').slice(0, 40);
}

/**
 * Given 2 SHA's in getsentry, get all commits (in sentry) in between the 2 given SHAs
 *
 * Does not include commits that originate in getsentry
 */
export async function getSentryPullRequestsForGetsentryRange(
  current: string,
  previous?: string | null,
  includeGetsentry?: boolean
): Promise<PullRequest[number][]> {
  // getsentry client
  const getsentry = await getClient(OWNER, GETSENTRY_REPO);
  const sentry = await getClient(OWNER, SENTRY_REPO);

  // Single commit
  if (!previous) {
    const resp = await getsentry.git.getCommit({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      commit_sha: current,
    });

    if (resp.status !== 200) {
      throw new Error('API Error: retrieving commit');
    }

    const isBumpCommit = isGetsentryBot(resp.data);
    if (!isBumpCommit && !includeGetsentry) {
      return [];
    }

    const sentryCommitSha = isBumpCommit && getSentrySha(resp.data.message);
    const client = isBumpCommit ? sentry : getsentry;
    const pullRequests = await client.repos.listPullRequestsAssociatedWithCommit(
      {
        owner: OWNER,
        repo: isBumpCommit ? SENTRY_REPO : GETSENTRY_REPO,
        commit_sha: sentryCommitSha || current,
      }
    );
    return pullRequests.data;
  }

  // Multiple commits
  const resp = await getsentry.repos.compareCommits({
    owner: OWNER,
    repo: GETSENTRY_REPO,
    base: previous,
    head: current,
  });

  if (resp.status !== 200) {
    throw new Error('API Error: comparing commits');
  }

  const { data } = resp;

  // Only look for synced commits from sentry
  // (e.g. where `getsentry-bot` is the committer)
  const syncedCommits = data.commits.filter(isGetsentryBot);
  const nonSyncedCommits = data.commits.filter(isNotGetsentryBot);
  const sentryShas = syncedCommits.map(({ commit }) =>
    getSentrySha(commit.message)
  );

  const pullRequestPromises = sentryShas.map((commit_sha) =>
    sentry.repos.listPullRequestsAssociatedWithCommit({
      owner: OWNER,
      repo: SENTRY_REPO,
      commit_sha,
    })
  );

  const getSentryPullRequestPromises = nonSyncedCommits.map(
    ({ sha: commit_sha }) =>
      getsentry.repos.listPullRequestsAssociatedWithCommit({
        owner: OWNER,
        repo: GETSENTRY_REPO,
        commit_sha,
      })
  );

  const pullRequests = await Promise.all([
    ...pullRequestPromises,
    ...getSentryPullRequestPromises,
  ]);

  return pullRequests.filter(Boolean).map(({ data }) => data?.[0]);
}
