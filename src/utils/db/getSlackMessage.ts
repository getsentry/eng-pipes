import { SlackMessageRow } from 'knex/types/tables';

import { SlackMessage } from '~/config/slackMessage';
import { db } from '~/utils/db';

export async function getSlackMessage<T extends SlackMessage>(
  type: T,
  refIds: string
): Promise<SlackMessageRow<T>>;
export async function getSlackMessage<T extends SlackMessage>(
  type: T,
  refIds: string[]
): Promise<SlackMessageRow<T>[]>;
export async function getSlackMessage<T extends SlackMessage>(
  type: T,
  refIds: string | string[]
): Promise<SlackMessageRow<T> | SlackMessageRow<T>[]> {
  if (typeof refIds === 'string') {
    return await db('slack_messages').where({ type, refId: refIds }).first('*');
  } else {
    return await db('slack_messages')
      .where({ type })
      .whereIn('refId', refIds)
      .select('*');
  }
}
