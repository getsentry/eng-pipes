import * as Sentry from '@sentry/node';

import nonPrPayload from '@test/payloads/sentry-autofix/non-pr.json';
import prCreatedPayload from '@test/payloads/sentry-autofix/pr-created.json';
import prCreatedSparsePayload from '@test/payloads/sentry-autofix/pr-created-sparse.json';
import { createSentryAutofixRequest } from '@test/utils/createSentryAutofixRequest';

import { buildServer } from '@/buildServer';
import { FEED_AUTOFIX_CHANNEL_ID } from '@/config';
import { bolt } from '@api/slack';

describe('sentry-autofix webhook', () => {
  let fastify;
  beforeEach(async () => {
    fastify = await buildServer(false);
  });

  afterEach(() => {
    fastify.close();
    jest.clearAllMocks();
  });

  it('posts to Slack on pr_created', async () => {
    const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    const response = await createSentryAutofixRequest(
      fastify,
      prCreatedPayload
    );

    expect(response.statusCode).toBe(200);
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const message = postMessageSpy.mock.calls[0][0] as any;
    expect(message.channel).toBe(FEED_AUTOFIX_CHANNEL_ID);
    expect(message.unfurl_links).toBe(false);
    const rendered = JSON.stringify(message.blocks);
    expect(rendered).toContain(
      'https://github.com/getsentry/sentry/pull/99999'
    );
    expect(rendered).toContain(
      'https://sentry.io/organizations/sentry/issues/1234567890/'
    );
    expect(rendered).toContain('getsentry/sentry#99999');
  });

  it('is a no-op for non-PR actions', async () => {
    const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    const response = await createSentryAutofixRequest(fastify, nonPrPayload);

    expect(response.statusCode).toBe(200);
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it('returns 401 for a valid-shape but wrong signature', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-autofix/webhook',
      headers: {
        'sentry-hook-signature':
          'd2c2e36b95268d0fc7965b2154fcb112b9578b9a9adbe5a38375d3253c971d6e',
      },
      payload: prCreatedPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for malformed signature', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-autofix/webhook',
      headers: {
        'sentry-hook-signature': 'invalid',
      },
      payload: prCreatedPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for no signature', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-autofix/webhook',
      payload: prCreatedPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('renders fallback text when PR/issue URLs and repo are missing', async () => {
    const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    const response = await createSentryAutofixRequest(
      fastify,
      prCreatedSparsePayload
    );

    expect(response.statusCode).toBe(200);
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const message = postMessageSpy.mock.calls[0][0] as any;
    const rendered = JSON.stringify(message.blocks);
    expect(rendered).toContain('Autofix PR');
    expect(rendered).toContain('the issue');
    expect(rendered).not.toContain('<https://');
  });

  it('captures Slack postMessage errors without 500ing', async () => {
    jest
      .spyOn(bolt.client.chat, 'postMessage')
      .mockRejectedValueOnce(new Error('slack down'));
    const captureSpy = jest.spyOn(Sentry, 'captureException');

    const response = await createSentryAutofixRequest(
      fastify,
      prCreatedPayload
    );

    expect(response.statusCode).toBe(200);
    expect(captureSpy).toHaveBeenCalled();
  });

  it('returns 500 when the payload throws in block-building', async () => {
    const response = await createSentryAutofixRequest(fastify, {
      action: 'pr_created',
    });

    expect(response.statusCode).toBe(500);
  });
});
