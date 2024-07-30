import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';

import { GoCDResponse } from '@types';

import { GOCD_WEBHOOK_SECRET } from '@/config';
import { extractAndVerifySignature } from '@/utils/extractAndVerifySignature';
import { gocdevents } from '@api/gocdevents';

export async function handler(
  request: FastifyRequest<{ Body: GoCDResponse }>,
  reply: FastifyReply
) {
  // If the webhook secret is not defined, return a 500
  if (GOCD_WEBHOOK_SECRET === undefined) {
    return reply.code(500).send();
  }
  try {
    const isVerified = await extractAndVerifySignature(
      request,
      reply,
      'x-gocd-signature',
      GOCD_WEBHOOK_SECRET
    );

    if (!isVerified) {
      return;
    }

    const { body }: { body: GoCDResponse } = request;
    gocdevents.emit(body.type, body);
    return reply.code(200).send('OK');
  } catch (err) {
    Sentry.captureException(err);
    return reply.code(500).send();
  }
}
