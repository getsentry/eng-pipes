import merge from 'lodash.merge';

import { Fastify } from '../../src/types';
import { createSignature } from '../../src/utils/createSignature';

import { getSlackEvent } from './getSlackEvent';

function createSlackSignature(payload, timestamp) {
  return createSignature(
    `v0:${timestamp}:${JSON.stringify(payload)}`,
    process.env.SLACK_SIGNING_SECRET || '',
    (i) => i,
    'sha256'
  );
}

const DEFAULT_PAYLOAD = {
  token: 'token',
  team_id: 'T018UAQ7YRW',
  api_app_id: 'A017XPC80S2',
  type: 'event_callback',
  event_id: 'Ev01NF8EPNU9',
  event_time: 1613340527,
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
};

export async function createSlackEvent(
  fastify: Fastify,
  event: string,
  payload?: Record<string, any>
) {
  const fullPayload = {
    ...DEFAULT_PAYLOAD,
    event: getSlackEvent(event, payload),
  };
  return injectEvent(fastify, fullPayload);
}

export async function createBasicSlackEvent(
  fastify: Fastify,
  event: string,
  payload?: Record<string, any>
) {
  const fullPayload = {
    ...DEFAULT_PAYLOAD,
    event: merge({ type: event }, payload),
  };
  return injectEvent(fastify, fullPayload);
}

async function injectEvent(fastify: Fastify, fullPayload: Record<string, any>) {
  const now = +new Date();
  const signature = createSlackSignature(fullPayload, now);
  return await fastify.inject({
    method: 'POST',
    url: '/apps/slack/events',
    headers: {
      'x-slack-request-timestamp': now,
      'x-slack-signature': `v0=${signature}`,
    },
    payload: fullPayload,
  });
}
