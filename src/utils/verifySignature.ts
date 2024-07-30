import crypto from 'crypto';

import { createSignature } from './createSignature';

export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  createDigest = (i) => i,
  method: 'sha1' | 'sha256' = 'sha256'
) {
  const digest = createSignature(payload, secret, createDigest, method);
  const checksum = Buffer.from(signature, 'utf8');
  if (
    checksum.length !== digest.length ||
    !crypto.timingSafeEqual(digest, checksum)
  ) {
    return false;
  }
  return true;
}
