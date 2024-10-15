import { FastifyReply, FastifyRequest } from 'fastify';

import { insertAssetSize } from '@/utils/db/metrics';

import { verifyWebhook } from './verifyWebhook';

export async function webpackWebhook(
  request: FastifyRequest<{
    Body: { pull_request_number: number } & Record<string, any>;
  }>,
  reply: FastifyReply
): Promise<void> {
  if (!verifyWebhook(request)) {
    reply.code(400).send();
    return;
  }

  insertAssetSize(request.body);

  reply.code(204).send();
  return;
}
