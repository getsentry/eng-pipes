import crypto from 'crypto';

export function createSignature(
  payload: string,
  secret: string,
  createDigest = (i) => i,
  method: 'sha1' | 'sha256' = 'sha1'
) {
  const hmac = crypto.createHmac(method, secret);
  const digest = Buffer.from(
    createDigest(hmac.update(payload).digest('hex')),
    'utf8'
  );

  return digest;
}
