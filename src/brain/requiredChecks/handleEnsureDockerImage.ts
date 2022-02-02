import { EmitterWebhookEvent } from '@octokit/webhooks';

import { BuildStatus } from '@/config';

import { rerunFlakeyJobs } from './rerunFlakeyJobs';

/**
 * There is a state where required checks are missing because they never get run
 * because a required prereq job has failed or timed out (Due to flakey ci
 * issues). In this case (failures/cancellations), we will attempt to re-run the job.
 *
 * Success case is ignored, as the parent requiredChecks brainlet will handle that case.
 */
export async function handleEnsureDockerImage({
  payload,
}: EmitterWebhookEvent<'check_run'>) {
  const { action, check_run: checkRun, repository } = payload;

  if (repository?.full_name !== 'getsentry/getsentry') {
    return;
  }

  if (!checkRun.name.startsWith('ensure docker image')) {
    return;
  }

  if (
    checkRun.conclusion !== BuildStatus.FAILURE &&
    checkRun.conclusion !== BuildStatus.CANCELLED
  ) {
    return;
  }

  // This will stop double messages because of action == 'created' and 'completed' with the
  // same status/conclusion
  // Run only on `completed` action (can be `created`, and not sure what `rerequested` is)
  // This can still fire multiple times if we have additional failing checks?
  // I don't think running this once on created will work either as you can have a created w/ non-failure
  // and later it becomes failing
  if (action !== 'completed') {
    console.warn(`Required check with non-completed action: ${payload.action}`);
    return;
  }

  await rerunFlakeyJobs([checkRun.id]);
}
