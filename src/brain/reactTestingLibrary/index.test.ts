import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { buildServer } from '@/buildServer';
import { bolt } from '@api/slack';

import getProgress from './getProgress';
import { reactTestingLibrary } from '.';

jest.mock('@api/slack');

jest.mock('./getProgress', () =>
  jest.fn(() => ({
    progress: 50,
    remainingFiles: 2,
  }))
);

describe('slack app', function () {
  let fastify;

  beforeEach(async function () {
    fastify = await buildServer(false);
    reactTestingLibrary();
  });

  afterEach(function () {
    fastify.close();
  });

  it('fetches react testing library status', async function () {
    const response = await createSlackAppMention(fastify, '<@U018UAXJVG8> rtl');
    expect(response.statusCode).toBe(200);
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(getProgress).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(bolt.client.chat.update.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blocks": Array [
          Object {
            "text": Object {
              "text": ":rtl: progress: *50%* completed, *2* files remaining",
              "type": "mrkdwn",
            },
            "type": "section",
          }
        ],
        "channel": "channel_id",
        "text": "RTL progress: 50% completed, 2 files remaining",
        "ts": "1234123.123",
      }
    `);
  });
});
