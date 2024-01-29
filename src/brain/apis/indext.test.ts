import { createSlackAppMention } from '@test/utils/createSlackAppMention';

import { buildServer } from '@/buildServer';
import { bolt } from '@api/slack';

import * as getAPIsStatsMessage from './getStatsMessage';
import { apis } from '.';

const STATS_TEXT = 'Some random team stats';
jest.mock('@api/slack');

describe('slack app', function () {
  let fastify, getStatsMessageSpy, postMessageSpy;

  beforeAll(() => {
    getStatsMessageSpy = jest.spyOn(getAPIsStatsMessage, 'getStatsMessage');
    getStatsMessageSpy.mockImplementation(() => {
      return {
        messages: [STATS_TEXT],
        should_show_docs: false,
        goal: 50,
        review_link: getAPIsStatsMessage.OWNERSHIP_FILE_LINK,
      };
    });
    postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
  });

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
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    expect(getStatsMessageSpy).toHaveBeenCalledWith('enterprise');

    expect(bolt.client.chat.update).toHaveBeenCalledTimes(1);
    expect(bolt.client.chat.update.mock.calls[0][0].blocks[0].text.text).toBe(
      STATS_TEXT
    );
  });
});
