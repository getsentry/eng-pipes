process.env.GH_WEBHOOK_SECRET = 'test';

import pullRequestPayload from '@test/payloads/github/pullRequest.json';
import crypto from 'crypto';

import { buildServer } from '@app/buildServer';
import * as verify from '@app/handlers/metrics/github/verifyWebhook';

describe('github > verifyWebhook', function() {
  let fastify;

  beforeEach(function() {
    fastify = buildServer();
    jest.spyOn(verify, 'verifyWebhook');
  });

  afterEach(function() {
    fastify.close();
  });

  it('verifies signature', async function() {
    const hmac = crypto.createHmac(
      'sha1',
      process.env.GH_WEBHOOK_SECRET as string
    );
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/github/webhook',
      headers: {
        'x-hub-signature': `sha1=${hmac
          .update(JSON.stringify(pullRequestPayload))
          .digest('hex')}`,
        'x-github-event': 'pull_request',
      },
      payload: pullRequestPayload,
    });
    expect(verify.verifyWebhook).toHaveReturnedWith(true);
    expect(response.statusCode).toBe(200);
  });

  it('fails with mismatched signature', async function() {
    const hmac = crypto.createHmac('sha1', 'rightsecret');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/github/webhook',
      headers: {
        'x-hub-signature': `sha1=${hmac
          .update(JSON.stringify(pullRequestPayload))
          .digest('hex')}`,
        'x-github-event': 'pull_request',
      },
      payload: pullRequestPayload,
    });
    expect(verify.verifyWebhook).toHaveReturnedWith(false);
    expect(response.statusCode).toBe(400);
    expect(console.error).toHaveBeenCalled();
    (console.error as jest.Mock).mockRestore();
  });
});
