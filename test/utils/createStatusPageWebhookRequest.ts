import { Fastify } from '@/types';
import { createSignature } from '@utils/createSignature';

function createKCPSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.STATUS_PAGE_WEBHOOK_SECRET ?? '',
    (i) => i,
    'sha256'
  );
}

export async function createKCPRequest(fastify: Fastify, payload: any) {
  const signature = createKCPSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/slack/status-page/webhook',
    headers: {
      'x-status-page-webhook-signature': signature.toString(),
    },
    payload: payload,
  });
}
