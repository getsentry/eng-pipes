import { createSlackEvent } from './createSlackEvent';

function createMessageEvent(text: string, event?: Record<string, any>) {
  return {
    client_msg_id: 'd9285761-0feb-44f1-8854-aecaf9aad3a2',
    type: 'app_mention',
    text,
    user: 'U018H4DA8N5',
    ts: '1611956722.000900',
    team: 'T018UAQ7YRW',
    channel: 'G018X8Y9B1N',
    event_ts: '1611956722.000900',
    ...event,
  };
}

const payload = {
  token: 'foo',
  team_id: 'T018UAQ7YRW',
  api_app_id: 'api_app_id',
  type: 'event_callback',
  event_id: 'Ev01L6RZSB9C',
  event_time: 1611956722,
  authed_users: ['U018UAXJVG8'],
  authorizations: [
    {
      enterprise_id: null,
      team_id: 'T018UAQ7YRW',
      user_id: 'U018UAXJVG8',
      is_bot: true,
      is_enterprise_install: false,
    },
  ],
  is_ext_shared_channel: false,
  event_context: '1-app_mention-T018UAQ7YRW-G018X8Y9B1N',
};

export async function createSlackMessage(fastify, message: string) {
  return await createSlackEvent(fastify, {
    ...payload,
    event: createMessageEvent(message),
  });
}
