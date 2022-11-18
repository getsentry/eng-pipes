import { EmitterWebhookEvent } from '@octokit/webhooks';

import { BuildStatus } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { githubEvents } from '@api/github';
import { isGetsentryRequiredCheck } from '@api/github/isGetsentryRequiredCheck';
import { getSlackMessage } from '@utils/db/getSlackMessage';

import { OK_CONCLUSIONS } from './constants';
import { handleNewFailedBuild } from './handleNewFailedBuild';
import { resolveFlakeyFailure } from './resolveFlakeyFailure';
import { resolveOtherFailure } from './resolveOtherFailure';

async function handler({
  id,
  payload,
  ...rest
}: EmitterWebhookEvent<'check_run'>) {
  // Make sure this is on `getsentry` and we are examining the aggregate
  // "required check" run
  if (!isGetsentryRequiredCheck({ id, payload, ...rest })) {
    return;
  }

  const { check_run: checkRun } = payload;

  // Check db to see if the check run at `head_sha` was already failing
  //
  // If so, and checkRun is passing, we can update the existing Slack message,
  // otherwise we can ignore as we don't need a new, spammy message
  const dbCheck = await getSlackMessage(
    SlackMessage.REQUIRED_CHECK,
    checkRun.head_sha
  );

  // Conclusion can be one of:
  //   success, failure, neutral, cancelled, skipped, timed_out, or action_required
  //
  // For "successful" conclusions, check if there was a previous failure, if so, update the existing slack message
  const isCheckSuccessful = OK_CONCLUSIONS.includes(checkRun.conclusion || '');

  // Checks to see if this passing build should resolve another previous
  // failure (from a different commit)
  if (
    isCheckSuccessful &&
    (!dbCheck || dbCheck.context.status !== BuildStatus.FAILURE)
  ) {
    return await resolveOtherFailure({
      checkRun,
    });
  } else if (isCheckSuccessful) {
    // Otherwise this commit had a flakey failure and is now passing
    return await resolveFlakeyFailure({ checkRun, dbCheck });
  }

  //
  // At this point, we know that the check is not successful //
  //

  // If the current commit was already failing then we don't need to do anything
  if (dbCheck && dbCheck.context.status === BuildStatus.FAILURE) {
    return;
  }

  // This will stop double messages because of action == 'created' and 'completed' with the
  // same status/conclusion
  // Run only on `completed` action (can be `created`, and not sure what `rerequested` is)
  // This can still fire multiple times if we have additional failing checks?
  // I don't think running this once on created will work either as you can have a created w/ non-failure
  // and later it becomes failing
  if (payload.action !== 'completed') {
    console.warn(`Required check with non-completed action: ${payload.action}`);
    return;
  }

  // Otherwise this is a new failure for this commit, handle accordingly
  return await handleNewFailedBuild({ checkRun });
}

export async function requiredChecks() {
  githubEvents.removeListener('check_run', handler);
  githubEvents.on('check_run', handler);
}
