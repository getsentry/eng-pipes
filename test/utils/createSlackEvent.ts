import { createSignature } from '@utils/createSignature';

function createSlackSignature(payload, timestamp) {
  return createSignature(
    `v0:${timestamp}:${JSON.stringify(payload)}`,
    process.env.SLACK_SIGNING_SECRET || '',
    (i) => i,
    'sha256'
  );
}
export async function createSlackEvent(fastify, payload) {
  const now = +new Date();
  const signature = createSlackSignature(payload, now);

  return await fastify.inject({
    method: 'POST',
    url: '/apps/slack/events',
    headers: {
      'x-slack-request-timestamp': now,
      'x-slack-signature': `v0=${signature}`,
    },
    payload,
  });
}
