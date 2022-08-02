import { Octokit } from '@octokit/rest';
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';

import { GETSENTRY_BOT_ID, GETSENTRY_REPO, OWNER, SENTRY_REPO } from '@/config';

import { ClientType } from './clientType';
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
  const octokit = await getClient(ClientType.App, OWNER);

  // Single commit
  if (!previous) {
    const resp = await octokit.git.getCommit({
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
    const pullRequests =
      await octokit.repos.listPullRequestsAssociatedWithCommit({
        owner: OWNER,
        repo: isBumpCommit ? SENTRY_REPO : GETSENTRY_REPO,
        commit_sha: sentryCommitSha || current,
      });
    return pullRequests.data;
  }

  // Multiple commits
  const resp = await octokit.repos.compareCommits({
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
    octokit.repos.listPullRequestsAssociatedWithCommit({
      owner: OWNER,
      repo: SENTRY_REPO,
      commit_sha,
    })
  );

  const getSentryPullRequestPromises = nonSyncedCommits.map(
    ({ sha: commit_sha }) =>
      octokit.repos.listPullRequestsAssociatedWithCommit({
        owner: OWNER,
        repo: GETSENTRY_REPO,
        commit_sha,
      })
  );

  const pullRequests = await Promise.all([
    ...pullRequestPromises,
    ...getSentryPullRequestPromises,
  ]);

  const result = pullRequests
    .filter(({ data }) => data.length)
    .map(({ data }) => data[0]);

  return result;
}
