import { FastifyRequest } from 'fastify';

import { insertAssetSize } from '../../../utils/db';
import { verifyWebhook } from './verifyWebhook';

export async function handler(request: FastifyRequest) {
  if (!verifyWebhook(request)) {
    throw new Error('Could not verify webhook signature');
  }

  insertAssetSize(request.body);

  return {};
}
