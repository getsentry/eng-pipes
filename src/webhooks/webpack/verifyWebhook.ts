import { FastifyRequest } from 'fastify';

import { verifySignature } from '~/utils/verifySignature';

export function verifyWebhook(request: FastifyRequest) {
  // XXX: `fastify` does not offer a "raw body" and instead provides us with the decoded payload
  // This is not ideal because of 1) extra processing, 2) potential signature mismatches, 3) potential attack vectors
  // These cases are unlikely in our use case, but it's good to note
  // See https://github.com/fastify/fastify/issues/707
  const payload = JSON.stringify(request.body);
  const signatureHeader = request.headers['x-webpack-signature'] || '';
  // This shouldn't be an array, but if it is, calling `join()` to appease TS,
  // and just have verification fail
  const sig = Array.isArray(signatureHeader)
    ? signatureHeader.join('')
    : signatureHeader;
  const SECRET = process.env.SENTRY_WEBPACK_WEBHOOK_SECRET || '';
  if (!SECRET) {
    throw new Error('SENTRY_WEBPACK_WEBHOOK_SECRET is not set');
  }

  return verifySignature(payload, sig, SECRET, (i) => `sha1=${i}`);
}
