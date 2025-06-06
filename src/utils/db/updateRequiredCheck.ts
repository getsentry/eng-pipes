import { BuildStatus } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { CheckRun } from '@/types/github';

import { insertBuildFailure } from './metrics';
import { saveSlackMessage } from './saveSlackMessage';
import { db } from '.';

type UpdateRequiredCheckParams = {
  status: BuildStatus;
  messageId: string;
  checkRun: CheckRun;
};

export async function updateRequiredCheck({
  status,
  messageId,
  checkRun,
}: UpdateRequiredCheckParams) {
  const updated_at = checkRun.completed_at
    ? new Date(checkRun.completed_at)
    : new Date();

  const previousBuild = await db('slack_messages')
    .where({
      type: SlackMessage.REQUIRED_CHECK,
      id: messageId,
    })
    .select('*')
    .first();

  return await Promise.all([
    // Insert into big query the duration where master is down
    // Only applies when status is FIXED or FLAKE
    insertBuildFailure({
      build_id: checkRun.head_sha,
      repo: 'getsentry/getsentry',
      start_timestamp: new Date(previousBuild.context.failed_at),
      end_timestamp: updated_at,
    }),

    // Update the slack message entry in db
    saveSlackMessage(
      SlackMessage.REQUIRED_CHECK,
      { id: messageId },
      {
        status,
        updated_at,
      }
    ),
  ]);
}
