import crypto from 'crypto';

export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  createDigest = i => i
) {
  const hmac = crypto.createHmac('sha1', secret);
  const digest = Buffer.from(
    createDigest(hmac.update(payload).digest('hex')),
    'utf8'
  );
  const checksum = Buffer.from(signature, 'utf8');
  if (
    checksum.length !== digest.length ||
    !crypto.timingSafeEqual(digest, checksum)
  ) {
    return false;
  }
  return true;
}
