import * as Sentry from '@sentry/node';

import { GETSENTRY_ORG, GETSENTRY_REPO_SLUG, SENTRY_REPO_SLUG } from '@/config';

/**
 * Attempts to find the relevant commit for a SHA
 *
 * Relevant in this case meaning it can be a PR on getsentry or a commit in sentry that
 * caused a bump commit in getsentry (whose commit message references the sentry commit).
 * In this case, it will return the sentry commit.
 */
export async function getRelevantCommit(ref: string) {
  // Create an error object here before we make any async calls so that we
  // have a helpful stack trace if it errors
  const preservedError = new Error('getRelevantCommit Error');

  try {
    // Attempt to get the getsentry commit first
    const { data: commit } = await GETSENTRY_ORG.api.repos.getCommit({
      owner: GETSENTRY_ORG.slug,
      repo: GETSENTRY_REPO_SLUG,
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
    const { data } = await GETSENTRY_ORG.api.repos.getCommit({
      owner: GETSENTRY_ORG.slug,
      repo: SENTRY_REPO_SLUG,
      ref: sentryCommitSha,
    });

    return data;
  } catch (err) {
    console.error('Failed to get relevant commits:', err);
    Sentry.captureException(preservedError, err);
    return null;
  }
}
