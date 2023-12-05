import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { buildServer } from '@/buildServer';
import { bolt } from '@api/slack';

import getStatsMessage, { OWNERSHIP_FILE_LINK } from './getStatsMessage';
import { apis } from '.';

const STATS_TEXT = 'Some random team stats';
jest.mock('@api/slack');

jest.mock('./getStatsMessage', () =>
  jest.fn(() => ({
    messages: [STATS_TEXT],
    should_show_docs: false,
    goal: 50,
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
    expect(getStatsMessage).toHaveBeenCalledWith('enterprise');

    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.update.mock.calls[0][0].blocks[0].text.text).toBe(
      STATS_TEXT
    );
  });
});
