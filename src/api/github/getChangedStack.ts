import * as Sentry from '@sentry/node';

import { GETSENTRY_ORG } from '@/config';

const FRONTEND_CHANGE_CHECK_NAME = 'only frontend changes';
const BACKEND_CHANGE_CHECK_NAME = 'only backend changes';

/**
 * Given a commit and repo, check GitHub Checks to see what type of changes
 * were made in the commit (frontend, backend, fullstack)
 */
export async function getChangedStack(ref: string, repo: string) {
  try {
    const check_runs = await GETSENTRY_ORG.api.paginate(
      GETSENTRY_ORG.api.checks.listForRef,
      {
        owner: GETSENTRY_ORG.slug,
        repo,
        ref,
        per_page: 100,
      }
    );

    const checkRuns = check_runs.filter(
      ({ name, conclusion }) =>
        conclusion === 'success' &&
        [
          FRONTEND_CHANGE_CHECK_NAME,
          BACKEND_CHANGE_CHECK_NAME,
          'fullstack changes',
        ].includes(name)
    );

    if (checkRuns.length === 0) {
      // Track this event in case the check status name changes in the future.
      Sentry.captureMessage(`Failed to identify the type of commit`, {
        extra: {
          Commit: `https://github.com/${GETSENTRY_ORG.slug}/${repo}/commit/${ref}`,
          'GH Check Runs': check_runs.map((c) => c.name),
        },
      });
      return {};
    }

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
