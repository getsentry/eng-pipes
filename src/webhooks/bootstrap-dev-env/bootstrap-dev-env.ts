import { FastifyReply, FastifyRequest } from 'fastify';

import { verifyEndpoint } from '@/utils/verifyEndpoint';
import { insert } from '@utils/metrics';

export async function handler(
  request: FastifyRequest<{ Body: { event: string; name: string } }>,
  reply: FastifyReply
) {
  if (!verifyEndpoint(request)) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
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

  return {};
}
