import testPayload from '@test/payloads/generic-notifier/testPayload.json';
import { createNotifierRequest } from '@test/utils/createGenericMessageRequest';

import { buildServer } from '@/buildServer';
import { DATADOG_API_INSTANCE } from '@/config';
import { bolt } from '@api/slack';

import { messageSlack } from './generic-notifier';

describe('generic messages webhook', function () {
  let fastify;
  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(function () {
    fastify.close();
    jest.clearAllMocks();
  });

  it('correctly inserts generic notifier when stage starts', async function () {
    jest.spyOn(bolt.client.chat, 'postMessage').mockImplementation(jest.fn());
    jest
      .spyOn(DATADOG_API_INSTANCE, 'createEvent')
      .mockImplementation(jest.fn());
    const response = await createNotifierRequest(fastify, testPayload);

    expect(response.statusCode).toBe(200);
  });

  it('returns 400 for invalid signature', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/event-notifier/v1',
      headers: {
        'x-infra-hub-signature': 'invalid',
      },
      payload: testPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for no signature', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/event-notifier/v1',
      payload: testPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  describe('messageSlack tests', function () {
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('writes to slack', async function () {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const message = postMessageSpy.mock.calls[0][0];
      expect(message).toEqual({
        channel: '#aaaaaa',
        text: 'Random text here',
        unfurl_links: false,
      });
    });
  });

  it('checks that slack msg is sent', async function () {
    const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    const response = await createNotifierRequest(fastify, testPayload);

    expect(postMessageSpy).toHaveBeenCalledTimes(1);

    expect(response.statusCode).toBe(200);
  });
  it('checks that dd msg is sent', async function () {
    const ddMessageSpy = jest.spyOn(DATADOG_API_INSTANCE, 'createEvent');
    const response = await createNotifierRequest(fastify, testPayload);

    expect(ddMessageSpy).toHaveBeenCalledTimes(1);

    expect(response.statusCode).toBe(200);
  });
});
