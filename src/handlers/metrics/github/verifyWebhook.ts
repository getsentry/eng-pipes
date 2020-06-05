import crypto from 'crypto';

import fastify from 'fastify';

const SECRET = process.env.GH_WEBHOOK_SECRET || '';

if (!SECRET) {
  throw new Error('GH_WEBHOOK_SECRET is not set');
}

export async function verifyWebhook(request: fastify.FastifyRequest) {
  // XXX: `fastify` does not offer a "raw body" and instead provides us with the decoded payload
  // This is not ideal because of 1) extra processing, 2) potential signature mismatches, 3) potential attack vectors
  // These cases are unlikely in our use case, but it's good to note
  const payload = JSON.stringify(request.body);
  const sig = request.headers['x-hub-signature'] || '';
  const hmac = crypto.createHmac('sha1', SECRET);
  const digest = Buffer.from(
    `sha1=${hmac.update(payload).digest('hex')}`,
    'utf8'
  );
  const checksum = Buffer.from(sig, 'utf8');
  if (
    checksum.length !== digest.length ||
    !crypto.timingSafeEqual(digest, checksum)
  ) {
    return false;
  }
  return true;
}
