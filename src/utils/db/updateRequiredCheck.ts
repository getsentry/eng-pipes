import { BuildStatus } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { CheckRun } from '@/types';

import { saveSlackMessage } from './saveSlackMessage';

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

  const updated_at = new Date(checkRun.completed_at ?? '');

  // Update the slack message entry in db
  return await saveSlackMessage(
    SlackMessage.REQUIRED_CHECK,
    { id: messageId },
    {
      status,
      updated_at,
    }
  );
}
