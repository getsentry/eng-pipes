import { FastifyReply, FastifyRequest } from 'fastify';

import { insert } from '@/utils/db/metrics';

export async function bootstrapWebhook(
  request: FastifyRequest<{ Body: { event: string; name: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { body: payload } = request;

  const now = new Date();

  insert({
    source: 'bootstrap-dev-env',
    event: payload.event,
    // timestamps can be null if it has not completed yet
    start_timestamp: payload.event === 'bootstrap_start' ? now : null,
    end_timestamp: payload.event === 'bootstrap_end' ? now : null,
    meta: {
      username: payload.name,
    },
  });

  reply.code(200).send('OK');

  return;
}
