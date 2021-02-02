import { buildServer } from '@app/buildServer';
import { web } from '@api/slack';
import getProgress from '@app/handlers/apps/slack/getProgress';
import { createSlackMessage } from '@test/utils/createSlackMessage';

jest.mock('@api/slack');

jest.mock('@app/handlers/apps/slack/getProgress', () =>
  jest.fn(() => ({
    progress: 1,
    remainingFiles: 2,
  }))
);

describe('slack app', function () {
  let fastify;

  beforeEach(function () {
    fastify = buildServer();
  });

  afterEach(function () {
    fastify.close();
  });

  it('fetches typescript status', async function () {
    const response = await createSlackMessage(
      fastify,
      '<@U018UAXJVG8> typescript'
    );
    expect(response.statusCode).toBe(200);
    expect(web.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(getProgress).toHaveBeenCalledWith({});
    expect(getProgress).toHaveBeenCalledWith({
      repo: 'getsentry',
      basePath: 'static/getsentry',
      appDir: 'gsApp',
    });
    expect(web.chat.update).toHaveBeenCalledTimes(1);
    expect(web.chat.update).toHaveBeenCalledWith(
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
