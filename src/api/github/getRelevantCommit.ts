import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';
import { Span } from '@sentry/tracing';

import { getClient } from '@/api/github/getClient';
import { GETSENTRY_REPO, OWNER, SENTRY_REPO } from '@/config';

/**
 * Attempts to find the relevant commit for a SHA
 *
 * Relevant in this case meaning it can be a PR on getsentry or a commit in sentry that
 * caused a bump commit in getsentry (whose commit message references the sentry commit).
 * In this case, it will return the sentry commit.
 */
export async function getRelevantCommit(ref: string, client?: Octokit) {
  const transaction = Sentry.getCurrentHub()?.getScope()?.getTransaction();

  const mainSpan = transaction?.startChild({
    op: 'fn.getRelevantCommit',
  });

  try {
    let span: Span | undefined;
    span = transaction?.startChild({
      op: 'fn.getClient',
      description: 'getClient()',
    });

    // We can save on making extra calls to get GH client
    const octokit = client || (await getClient(OWNER, GETSENTRY_REPO));

    span?.finish();

    span = transaction?.startChild({
      op: 'api.github:repos.getCommit',
    });

    // Attempt to get the getsentry commit first
    const { data: commit } = await octokit.repos.getCommit({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      ref,
    });

    span?.finish();

    if (!commit) {
      mainSpan?.finish();
      return null;
    }
    const commitMatches = commit.commit.message.match(
      /getsentry\/sentry@(\w+)/
    );
    const sentryCommitSha = commitMatches?.[1];

    if (!sentryCommitSha) {
      mainSpan?.finish();
      return commit;
    }

    span = transaction?.startChild({
      op: 'api.github:repos.getCommit',
    });

    // If this matches, then it means the commit was a bump from the getsentry bot due to
    // a merge in the sentry repo
    //
    // In this case, fetch the sentry commit to display
    const { data } = await octokit.repos.getCommit({
      owner: OWNER,
      repo: SENTRY_REPO,
      ref: sentryCommitSha,
    });

    span?.finish();

    mainSpan?.finish();
    return data;
  } catch (err) {
    Sentry.captureException(err);
    mainSpan?.finish();
    return null;
  }
}
