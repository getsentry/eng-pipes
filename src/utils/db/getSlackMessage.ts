import { SlackMessage } from '@/config/slackMessage';
import { db } from '@utils/db';

export async function getSlackMessage(type: SlackMessage, refId: string) {
  return await db('slack_messages').where({ refId, type }).first('*');
}
