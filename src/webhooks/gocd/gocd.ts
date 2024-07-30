import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';

import { GoCDResponse } from '@types';

import { GOCD_WEBHOOK_SECRET } from '@/config';
import { verifySignature } from '@/utils/verifySignature';
import { gocdevents } from '@api/gocdevents';

export async function handler(
  request: FastifyRequest<{ Body: GoCDResponse }>,
  reply: FastifyReply
) {
  try {
    const clientSignatureHeader = request.headers['x-gocd-signature'] ?? '';

    const clientSignature = Array.isArray(clientSignatureHeader)
      ? clientSignatureHeader.join('')
      : clientSignatureHeader;

    const isVerified = verifySignature(
      JSON.stringify(request.body),
      clientSignature,
      GOCD_WEBHOOK_SECRET,
      (i) => i,
      'sha256'
    );

    if (!isVerified) {
      return reply.code(401).send('Unauthorized');
    }

    const { body }: { body: GoCDResponse } = request;
    gocdevents.emit(body.type, body);
    return reply.code(200).send('OK');
  } catch (err) {
    Sentry.captureException(err);
    return reply.code(500).send();
  }
}
