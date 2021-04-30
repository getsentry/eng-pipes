import { BuildStatus } from '@/config';
import { SlackMessage } from '@/config/slackMessage';
import { db } from '@utils/db';
import { getTimestamp } from '@utils/db/getTimestamp';

/**
 * Getsentry is considered to be "failing" if we have a failed status check (which gets saved to `slack_messages`)
 * within the last 2 hours (by default)
 *
 * Returns slack messages that have failed since `since`
 */
export async function getFailureMessages(
  since: string | null = `now() - interval '2 hours'`
) {
  const query = db('slack_messages')
    .select('*')
    .select(db.raw(`${getTimestamp(`context::json->>'failed_at'`)} as date`))
    .where({
      type: SlackMessage.REQUIRED_CHECK,
    })
    .where(db.raw(`context::json->>'status' = '${BuildStatus.FAILURE}'`))
    .orderBy('date', 'desc');

  if (since !== null) {
    query.where(
      db.raw(`${getTimestamp(`context::json->>'failed_at'`)} >= ${since}`)
    );
  }

  return await query;
}
