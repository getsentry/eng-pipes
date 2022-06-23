import * as Sentry from '@sentry/node';

import { getClient } from '@/api/github/getClient';
import { GETSENTRY_REPO, OWNER } from '@/config';

import { OK_CONCLUSIONS } from './constants';
import { isRestartableStep } from './isRestartableStep';

/**
 * Examine failed jobs and try to determine if it was an intermittent issue
 * or not. If so, we can restart the workflow and ignore this ever happened.
 */
export async function rerunFlakeyJobs(failedJobIds: number[]) {
  const octokit = await getClient(OWNER);

  // An entry will exist if it has been re-run
  const reruns = new Map<number, true>();

  for (const job_id of failedJobIds) {
    // We first need to get the job from GH API
    const { data: job } = await octokit.actions.getJobForWorkflowRun({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      job_id,
    });

    const attempt_number = Number(job.run_attempt ?? 1);

    // This has already been run once, do not attempt to retry. Check next failed job.
    if (attempt_number > 1) {
      continue;
    }

    // The job's workflow has already been restarted, check next failed job.
    if (reruns.has(job.run_id)) {
      continue;
    }

    // Check the job's steps to see what step it failed at and restart if necessary
    //
    // This is a bit confusing with outer scope's `jobs` which comes from the
    // content of a GitHub Check that we produce with an Action in the
    // `getsentry` repo. It is simply a string that contains GH markdown for a
    // table of check run link + conclusion

    // TODO(billy): Eventually we may want to look at annotations and/or logs
    // to decide if we want to restart
    const failedSteps =
      job.steps?.filter(
        ({ status, conclusion }) =>
          // conclusion is `null` if status is not "completed" (e.g. in progress)
          // in which case, we do not want to cancel and restart
          status === 'completed' && !OK_CONCLUSIONS.includes(conclusion ?? '')
      ) || [];

    const restartableFailedStep = failedSteps.find(isRestartableStep);

    // Restart the workflow
    // https://docs.github.com/en/rest/reference/actions#re-run-a-workflow
    if (restartableFailedStep) {
      try {
        // Need to cancel the workflow before we can re-run it
        await octokit.actions.cancelWorkflowRun({
          owner: OWNER,
          repo: GETSENTRY_REPO,
          run_id: job.run_id,
        });

        await octokit.request(
          'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun',
          {
            owner: OWNER,
            repo: GETSENTRY_REPO,
            run_id: job.run_id,
          }
        );
        reruns.set(job.run_id, true);
      } catch (err) {
        // Capture this to Sentry but don't throw as we don't want to block our failure messages
        Sentry.captureException(err);
      }
    }

    if (failedSteps.length > 0) {
      Sentry.withScope(async (scope) => {
        const stepName = failedSteps[0].name;
        scope.setTag('stepName', stepName);
        Sentry.startTransaction({
          name: 'requiredChecks.failedStep',
        }).finish();
      });
    }
  }

  return {
    hasReruns: reruns.size > 1,
  };
}
