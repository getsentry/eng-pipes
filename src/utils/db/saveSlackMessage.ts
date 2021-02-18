import { SlackMessage } from '@/config/slackMessage';
import { db } from '@utils/db';

interface SaveSlackMessage {
  refId?: string;
  id?: string;
  channel?: string;
  ts?: string;
}

export async function saveSlackMessage(
  type: SlackMessage.REQUIRED_CHECK,
  { refId, channel, ts, id }: SaveSlackMessage,
  context: Record<string, any>
) {
  if (id) {
    await db('slack_messages')
      .where({
        id,
      })
      .update({
        // @ts-ignore
        context: db.raw(`context || ?`, [
          {
            status: context.status,
            passed_at: context.status === 'success' ? new Date() : null,
          },
        ]),
      });
    return;
  }

  return await db('slack_messages').insert({
    refId,
    channel,
    ts,
    type,

    context: {
      ...context,
      passed_at: context.status === 'success' ? new Date() : null,
      failed_at: new Date(),
    },
  });
}
