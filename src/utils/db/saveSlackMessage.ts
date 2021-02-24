import { SlackMessage } from '@/config/slackMessage';
import { db } from '@utils/db';

interface SaveSlackMessage {
  refId: string;
  channel: string;
  ts: string;
  id?: string;
  user?: string;
}

type UpdateSlackMessage = Required<Pick<SaveSlackMessage, 'id'>> &
  Partial<Omit<SaveSlackMessage, 'id'>>;

export async function saveSlackMessage(
  type: SlackMessage,
  { refId, channel, ts, id, user }: SaveSlackMessage | UpdateSlackMessage,
  context: Record<string, any>
) {
  if (id) {
    return await db('slack_messages')
      .where({
        id,
      })
      .update({
        // @ts-ignore
        context: db.raw(`context || ?`, [JSON.stringify(context)]),
      });
  }

  return await db('slack_messages').returning('*').insert({
    refId,
    channel,
    user,
    ts,
    type,
    context,
  });
}
