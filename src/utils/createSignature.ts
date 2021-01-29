import crypto from 'crypto';

export function createSignature(
  payload: string,
  secret: string,
  createDigest = (i) => i
) {
  const hmac = crypto.createHmac('sha1', secret);
  const digest = Buffer.from(
    createDigest(hmac.update(payload).digest('hex')),
    'utf8'
  );

  return digest;
}
