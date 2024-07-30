import { FastifyReply, FastifyRequest } from 'fastify';

import { SHA256_REGEX } from '@/config';

import { verifySignature } from './verifySignature';

export async function extractAndVerifySignature(
  request: FastifyRequest,
  reply: FastifyReply,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const clientSignatureHeader = request.headers[signatureHeader];

  // If the clientSignatureHeader is not present or is an array, return a 400
  if (
    clientSignatureHeader === undefined ||
    Array.isArray(clientSignatureHeader)
  ) {
    reply.code(400).send();
    return false;
  }

  if (!SHA256_REGEX.test(clientSignatureHeader)) {
    reply.code(400).send();
    return false;
  }

  const isVerified = verifySignature(
    JSON.stringify(request.body),
    clientSignatureHeader,
    secret,
    (i) => i,
    'sha256'
  );

  if (!isVerified) {
    reply.code(401).send('Unauthorized');
    return false;
  }

  return true;
}
