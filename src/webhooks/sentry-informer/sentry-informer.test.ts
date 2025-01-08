import * as Sentry from '@sentry/node';

import testAdminPayload from '@test/payloads/sentry-informer/testAdminPayload.json';
import testBadPayload from '@test/payloads/sentry-informer/testBadPayload.json';
import testPayload from '@test/payloads/sentry-informer/testPayload.json';
import { createSentryInformerRequest } from '@test/utils/createSentryInformerRequest';

import { buildServer } from '@/buildServer';
import { bolt } from '@api/slack';

import { messageSlack } from './sentry-informer';
import { TRIAGE_INCIDENTS_CHANNED_ID } from '@/config';

describe('sentry-informer webhook', () => {
  let fastify;
  beforeEach(async () => {
    fastify = await buildServer(false);
  });

  afterEach(() => {
    fastify.close();
    jest.clearAllMocks();
  });

  it('correctly inserts sentry-informer webhook when stage starts', async () => {
    const response = await createSentryInformerRequest(fastify, testPayload);

    expect(response.statusCode).toBe(200);
  });

  it('returns 400 for invalid signature', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-informer/webhook',
      headers: {
        'x-sentry-informer-signature': 'invalid',
      },
      payload: testPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for no signature', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-informer/webhook',
      payload: testPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  describe('messageSlack tests', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('handles bad fields and reports to Sentry', async () => {
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      const sentrySetContextSpy = jest.spyOn(Sentry, 'setContext');
      await messageSlack(testBadPayload);
      expect(sentryCaptureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(sentrySetContextSpy).toHaveBeenCalledTimes(1);
      expect(sentrySetContextSpy.mock.calls[0][0]).toEqual(`message_data`);
      expect(sentrySetContextSpy.mock.calls[0][1]).toEqual({
        message: {
          action: "all",
          bad_key_name: 'not good',
          source: 'sentry-informer',
          user: 'some user',
        },
      });
    });

    it('writes to slack', async () => {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const message = postMessageSpy.mock.calls[0][0];
      expect(message).toEqual({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'Production Access',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'some_user has elevated privileges to all for some_incident.',
            },
          },
        ],
        text: '',
        channel: TRIAGE_INCIDENTS_CHANNED_ID,
        unfurl_links: false,
      });
    });

    it('only writes sentry-informer changes', async () => {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testAdminPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });
  });
});