import crypto, { BinaryLike } from 'crypto';

import fastify from 'fastify';
import fetch from 'node-fetch';

import { TravisPayload } from './types';

export async function verifyTravisWebhook(request: fastify.FastifyRequest) {
  const { payload } = request.body;
  const payloadObject = JSON.parse(payload);

  // We need to make an API request to the respective travis endpoint
  // e.g. .org vs .com based on the build url of payload
  //
  const travisHost = payloadObject.build_url.startsWith('https://travis-ci.org')
    ? 'travis-ci.org'
    : 'travis-ci.com';
  const travisApiHost = `https://api.${travisHost}/config`;

  const resp = await fetch(travisApiHost);

  if (!resp.ok) {
    return false;
  }

  const body = await resp.json();
  const travisPublicKey = body.config.notifications.webhook.public_key;

  const travisSignature = Buffer.from(request.headers.signature, 'base64');
  const verifier = crypto.createVerify('sha1');

  verifier.update((payload as unknown) as BinaryLike);
  return verifier.verify(travisPublicKey, travisSignature);
}
