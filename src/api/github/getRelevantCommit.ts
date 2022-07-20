import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';

import { GETSENTRY_REPO, OWNER, SENTRY_REPO } from '@/config';
import { ClientType, getClient } from '@api/github/getClient';

/**
 * Attempts to find the relevant commit for a SHA
 *
 * Relevant in this case meaning it can be a PR on getsentry or a commit in sentry that
 * caused a bump commit in getsentry (whose commit message references the sentry commit).
 * In this case, it will return the sentry commit.
 */
export async function getRelevantCommit(ref: string, client?: Octokit) {
  try {
    // We can save on making extra calls to get GH client
    const octokit = client || (await getClient(ClientType.App, OWNER));

    // Attempt to get the getsentry commit first
    const { data: commit } = await octokit.repos.getCommit({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      ref,
    });

    if (!commit) {
      return null;
    }
    const commitMatches = commit.commit.message.match(
      /getsentry\/sentry@(\w+)/
    );
    const sentryCommitSha = commitMatches?.[1];

    if (!sentryCommitSha) {
      return commit;
    }

    // If this matches, then it means the commit was a bump from the getsentry bot due to
    // a merge in the sentry repo
    //
    // In this case, fetch the sentry commit to display
    const { data } = await octokit.repos.getCommit({
      owner: OWNER,
      repo: SENTRY_REPO,
      ref: sentryCommitSha,
    });

    return data;
  } catch (err) {
    Sentry.captureException(err);
    return null;
  }
}
