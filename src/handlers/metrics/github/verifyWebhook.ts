import fastify from 'fastify';

import { verifySignature } from '../../../utils/verifySignature';

export function verifyWebhook(request: fastify.FastifyRequest) {
  // XXX: `fastify` does not offer a "raw body" and instead provides us with the decoded payload
  // This is not ideal because of 1) extra processing, 2) potential signature mismatches, 3) potential attack vectors
  // These cases are unlikely in our use case, but it's good to note
  // See https://github.com/fastify/fastify/issues/707
  const payload = JSON.stringify(request.body);
  const sig = request.headers['x-hub-signature'] || '';
  const SECRET = process.env.GH_WEBHOOK_SECRET || '';
  if (!SECRET) {
    throw new Error('GH_WEBHOOK_SECRET is not set');
  }

  if (!sig) {
    console.warn('No `x-hub-signature` header found');
  }

  return verifySignature(payload, sig, SECRET, i => `sha1=${i}`);
}
