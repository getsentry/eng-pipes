import { SlackMessage } from '~/config/slackMessage';
import { db } from '~/utils/db';

interface SaveSlackMessage {
  refId: string;
  channel: string;
  ts: string;
  id?: string;
}

type UpdateSlackMessage = Required<Pick<SaveSlackMessage, 'id'>> &
  Partial<Omit<SaveSlackMessage, 'id'>>;

export async function saveSlackMessage(
  type: SlackMessage,
  { refId, channel, ts, id }: SaveSlackMessage | UpdateSlackMessage,
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
    ts,
    type,
    context,
  });
}
