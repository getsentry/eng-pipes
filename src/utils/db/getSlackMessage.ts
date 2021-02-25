import { SlackMessageRow } from 'knex/types/tables';

import { SlackMessage } from '@/config/slackMessage';
import { db } from '@utils/db';

export async function getSlackMessage(
  type: SlackMessage,
  refIds: string
): Promise<SlackMessageRow>;
export async function getSlackMessage(
  type: SlackMessage,
  refIds: string[]
): Promise<SlackMessageRow[]>;
export async function getSlackMessage(
  type: SlackMessage,
  refIds: string | string[]
): Promise<SlackMessageRow | SlackMessageRow[]> {
  if (typeof refIds === 'string') {
    return await db('slack_messages').where({ type, refId: refIds }).first('*');
  } else {
    return await db('slack_messages')
      .where({ type })
      .whereIn('refId', refIds)
      .select('*');
  }
}
