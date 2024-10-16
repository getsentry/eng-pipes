import { Fastify } from '@/types';
import { createSignature } from '@/utils/auth/createSignature';

import { GenericEvent } from '../../src/types/index';

function createNotifierSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.TESTING_SECRET || '',
    (i) => i,
    'sha256'
  );
}

export async function createNotifierRequest(
  fastify: Fastify,
  payload: GenericEvent
) {
  const signature = createNotifierSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/kafka-control-plane/webhook',
    headers: {
      'x-infra-hub-signature': signature.toString(),
    },
    payload: payload,
  });
}
