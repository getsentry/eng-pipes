import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { buildServer } from '@/buildServer';
import { bolt } from '@api/slack';

import getStats, { OWNERSHIP_FILE_LINK } from './getStats';
import { apis } from '.';

const STATS_TEXT = 'Some random team stats';
jest.mock('@api/slack');

jest.mock('./getStats', () =>
  jest.fn(() => ({
    message: STATS_TEXT,
    should_show_docs: true,
    review_link: OWNERSHIP_FILE_LINK,
  }))
);

describe('slack app', function () {
  let fastify;

  beforeEach(async function () {
    fastify = await buildServer(false);
    apis();
  });

  afterEach(function () {
    fastify.close();
  });

  it('fetches api stats', async function () {
    const response = await createSlackAppMention(
      fastify,
      '<@U018UAXJVG8> apis enterprise'
    );
    expect(response.statusCode).toBe(200);
    expect(bolt.client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(getStats).toHaveBeenCalledWith({team: "enterprise"});
    
    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(bolt.client.chat.update.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blocks": Array [
          Object {
            "text": Object {
              "text": ${STATS_TEXT},
              "type": "mrkdwn",
            },
            "type": "section",
          },
        "channel": "channel_id",
        "text": ${STATS_TEXT},
        "ts": "1234123.123",
      }
    `);
  });
});
