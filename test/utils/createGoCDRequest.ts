import { Fastify } from '@/types';
import { createSignature } from '@/utils/auth/createSignature';

function createGoCDSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.GOCD_WEBHOOK_SECRET || '',
    (i) => i,
    'sha256'
  );
}

export async function createGoCDRequest(
  fastify: Fastify,
  payload: Record<string, any>
) {
  const signature = createGoCDSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/gocd/webhook',
    headers: {
      'x-gocd-signature': signature.toString(),
    },
    payload: payload,
  });
}
