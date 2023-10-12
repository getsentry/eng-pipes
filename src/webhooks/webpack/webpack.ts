import { FastifyReply, FastifyRequest } from 'fastify';

import { verifyWebhook } from './verifyWebhook';

import { insertAssetSize } from '~/src/utils/metrics';

export async function handler(
  request: FastifyRequest<{
    Body: { pull_request_number: number } & Record<string, any>;
  }>,
  reply: FastifyReply
) {
  if (!verifyWebhook(request)) {
    reply.code(400);
    return {};
  }

  insertAssetSize(request.body);

  reply.code(204);
  return {};
}
