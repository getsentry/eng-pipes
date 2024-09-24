import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { buildServer } from '@/buildServer';
import { bolt } from '@/init/slack';

import getProgress from './getProgress';
import { typescript } from '.';

jest.mock('@/init/slack');

jest.mock('./getProgress', () =>
  jest.fn(() => ({
    progress: 50,
    total: 4,
    remainingFiles: 2,
  }))
);

describe('slack app', function () {
  let fastify;

  beforeEach(async function () {
    fastify = await buildServer(false);
    typescript();
  });

  afterEach(function () {
    fastify.close();
  });

  it('fetches typescript status', async function () {
    const response = await createSlackAppMention(
      fastify,
      '<@U018UAXJVG8> typescript'
    );
    expect(response.statusCode).toBe(200);
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(getProgress).toHaveBeenCalledWith({});
    expect(getProgress).toHaveBeenCalledWith({
      repo: 'sentry',
      basePath: 'fixtures',
      appDir: 'js-stubs',
    });
    expect(getProgress).toHaveBeenCalledWith({
      repo: 'getsentry',
      basePath: 'static/getsentry',
      appDir: 'gsApp',
    });
    expect(getProgress).toHaveBeenCalledWith({
      repo: 'getsentry',
      basePath: 'static/getsentry',
      appDir: 'gsAdmin',
    });
    expect(getProgress).toHaveBeenCalledWith({
      repo: 'getsentry',
      basePath: 'tests/js',
      appDir: 'fixtures',
    });

    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(bolt.client.chat.update.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blocks": Array [
          Object {
            "text": Object {
              "text": ":typescript: progress: *50%* completed, *10* files remaining",
              "type": "mrkdwn",
            },
            "type": "section",
          },
          Object {
            "text": Object {
              "text": "• *sentry:* 2 files remain (50%)
      • *getsentry app:* 2 files remain (50%)
      • *getsentry admin:* 2 files remain (50%)",
              "type": "mrkdwn",
            },
            "type": "section",
          },
        ],
        "channel": "G018X8Y9B1N",
        "text": "TypeScript progress: 50% completed, 10 files remaining",
        "ts": "1234123.123",
      }
    `);
  });
});
