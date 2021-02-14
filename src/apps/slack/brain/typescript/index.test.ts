import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { bolt } from '@api/slack';

import { buildServer } from '@/buildServer';
import getProgress from '@apps/slack/getProgress';

jest.mock('@api/slack');

jest.mock('@apps/slack/getProgress', () =>
  jest.fn(() => ({
    progress: 1,
    remainingFiles: 2,
  }))
);

describe('slack app', function () {
  let fastify;

  beforeEach(function () {
    fastify = buildServer(false);
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
      repo: 'getsentry',
      basePath: 'static/getsentry',
      appDir: 'gsApp',
    });
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [
          {
            text: {
              text:
                ':typescript: progress: *1%* completed, *4* files remaining',
              type: 'mrkdwn',
            },
            type: 'section',
          },
          {
            text: {
              text: `• *sentry:* 2 files remain (1%)
• *getsentry:* 2 files remain (1%)`,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: 'channel_id',
        text: 'TypeScript progress: 1% completed, 4 files remaining',
        ts: '1234123.123',
      })
    );
  });
});
