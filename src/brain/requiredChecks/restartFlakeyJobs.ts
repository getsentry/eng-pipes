import { getClient } from '@/api/github/getClient';
import { GETSENTRY_REPO, OWNER } from '@/config';

import { OK_CONCLUSIONS, RESTARTABLE_JOB_STEPS } from './constants';

/**
 * Examine failed jobs and try to determine if it was an intermittent issue
 * or not. If so, we can restart the workflow and ignore this ever happened.
 */
export async function restartFlakeyJobs(failedJobIds: number[]) {
  const octokit = await getClient(OWNER);

  // Results will hold a map of <workflowRunId, true>
  const results = new Map<number, true>();

  for (const job_id of failedJobIds) {
    // We first need to get the job from GH API
    const { data: job } = await octokit.actions.getJobForWorkflowRun({
      owner: OWNER,
      repo: GETSENTRY_REPO,
      job_id,
    });

    const attempt_number = Number(job.run_attempt ?? 0);

    // This has already been run once, do not attempt to retry. Check next failed job.
    if (attempt_number > 1) {
      continue;
    }

    // The job's workflow has already been restarted, check next failed job.
    if (results.has(job.run_id)) {
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
    const restartableFailedStep = job.steps
      ?.filter(({ conclusion }) => !OK_CONCLUSIONS.includes(conclusion || ''))
      .find(({ name }) => RESTARTABLE_JOB_STEPS.includes(name));

    // Restart the workflow
    // https://docs.github.com/en/rest/reference/actions#re-run-a-workflow

    if (restartableFailedStep) {
      octokit.request(
        'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun',
        {
          owner: OWNER,
          repo: GETSENTRY_REPO,
          run_id: job.run_id,
        }
      );
      results.set(job.run_id, true);
    }
  }

  return {
    hasRestarts: results.size > 1,
  };
}
