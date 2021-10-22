import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/node';

import { getClient } from '@/api/github/getClient';
import { OWNER } from '@/config';

const FRONTEND_CHANGE_CHECK_NAME = 'only frontend changes';
const BACKEND_CHANGE_CHECK_NAME = 'only backend changes';

/**
 * Given a commit and repo, check GitHub Checks to see what type of changes
 * were made in the commit (frontend, backend, fullstack)
 */
export async function getChangedStack(
  ref: string,
  repo: string,
  client?: Octokit
) {
  try {
    // We can save on making extra calls to get GH client
    const octokit = client || (await getClient(OWNER));

    const { data } = await octokit.checks.listForRef({
      owner: OWNER,
      repo,
      ref,
    });

    const checkRuns = data.check_runs.filter(
      ({ name, conclusion }) =>
        conclusion === 'success' &&
        [
          FRONTEND_CHANGE_CHECK_NAME,
          BACKEND_CHANGE_CHECK_NAME,
          'fullstack changes',
        ].includes(name)
    );
    const isFrontendOnly = !!checkRuns.find(
      ({ name }) => name === FRONTEND_CHANGE_CHECK_NAME
    );
    const isBackendOnly = !!checkRuns.find(
      ({ name }) => name === BACKEND_CHANGE_CHECK_NAME
    );

    return {
      isFrontendOnly,
      isBackendOnly,
      isFullstack: !isFrontendOnly && !isBackendOnly,
    };
  } catch (err) {
    Sentry.captureException(err);
    return {};
  }
}
