import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';

import { GoCDResponse } from '@types';

import { gocdevents } from '@/api/gocd/gocdEventEmitter';
import { GOCD_WEBHOOK_SECRET } from '@/config';
import { extractAndVerifySignature } from '@/utils/extractAndVerifySignature';

export async function handler(
  request: FastifyRequest<{ Body: GoCDResponse }>,
  reply: FastifyReply
) {
  try {
    // If the webhook secret is not defined, throw an error
    if (GOCD_WEBHOOK_SECRET === undefined) {
      throw new Error('GOCD_WEBHOOK_SECRET is not defined');
    }
    const isVerified = await extractAndVerifySignature(
      request,
      reply,
      'x-gocd-signature',
      GOCD_WEBHOOK_SECRET
    );

    if (!isVerified) {
      // If the signature is not verified, return (since extractAndVerifySignature sends the response)
      return;
    }

    const { body }: { body: GoCDResponse } = request;
    gocdevents.emit(body.type, body);
    reply.code(200).send('OK');
    return;
  } catch (err) {
    Sentry.captureException(err);
    reply.code(500).send();
    return;
  }
}
