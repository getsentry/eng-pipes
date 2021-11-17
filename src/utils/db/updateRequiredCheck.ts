import { BuildStatus } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { CheckRun } from '@/types';

import { insertBuildFailure } from '../metrics';

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
  // TODO: Insert into big query the duration where master is down
  // Only applies when status is FIXED or FLAKE
  // we want repo, head_sha, start, finish, duration

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

  // Update the slack message entry in db
  return await Promise.all([
    insertBuildFailure({
      id: checkRun.head_sha,
      repo: 'getsentry/getsentry',
      start_timestamp: new Date(previousBuild.context.failed_at),
      end_timestamp: updated_at,
    }),
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
