import { Fastify } from '@/types';
import { createSignature } from '@utils/createSignature';

function createKCPSignature(payload) {
  return createSignature(
    JSON.stringify(payload),
    process.env.KAFKA_CONTROL_PLANE_WEBHOOK_SECRET,
    (i) => i,
    'sha256'
  );
}

export async function createKCPRequest(fastify: Fastify, payload: any) {
  const signature = createKCPSignature(payload);

  return await fastify.inject({
    method: 'POST',
    url: '/metrics/kafka-control-plane/webhook',
    headers: {
      'x-kafka-control-plane-signature': signature.toString(),
    },
    payload: payload,
  });
}
