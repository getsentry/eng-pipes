import testemptypayload from '@test/payloads/options-automator/testemptypayload.json';
import testparitalpayload from '@test/payloads/options-automator/testpartialpayload.json';
import testpayload from '@test/payloads/options-automator/testpayload.json';

import { messageSlack } from './options-automator';

import { bolt } from '~/api/slack';
import { buildServer } from '~/buildServer';

describe('options-automator webhook', function () {
  let fastify;
  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(function () {
    fastify.close();
  });

  it('correctly inserts options-automator webhook when stage starts', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/options-automator/webhook',
      payload: testemptypayload,
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('test message slack', function () {
  afterEach(function () {
    jest.clearAllMocks();
  });

  it('writes to slack', async function () {
    const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    await messageSlack(testpayload);
    expect(postMessageSpy).toHaveBeenCalledTimes(2);
    const firstMessage = postMessageSpy.mock.calls[0][0];
    const secondMessage = postMessageSpy.mock.calls[1][0];
    expect(firstMessage).toEqual({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '✅ Successfully Updated Options in test_region: ✅',
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Updated options:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: 'updated `updated_option_1` with db value `db_value_1` to value `new_value_1`',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Set Options:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: 'Set `set_option_1` to value `set_value_1`',
            },
            {
              type: 'mrkdwn',
              text: 'Set `set_option_2` to value `set_value_2`',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Unset Options:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: 'Unset `unset_option_1`',
            },
            {
              type: 'mrkdwn',
              text: 'Unset `unset_option_2`',
            },
          ],
        },
      ],
      channel: 'C05QM3AUDKJ',
      text: '',
      unfurl_links: false,
    });
    expect(secondMessage).toEqual({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '❌ FAILED TO UPDATE in test_region: ❌',
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*DRIFTED OPTIONS:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '`drifted_option_1` drifted. value on db: `value_1`',
            },
            {
              type: 'mrkdwn',
              text: '`drifted_option_2` drifted. value on db: `value_2`',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*FAILED:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: 'FAILED TO UPDATE `error_option_1` \nREASON: `Error occurred for option 1`',
            },
            {
              type: 'mrkdwn',
              text: 'FAILED TO UPDATE `error_option_2` \nREASON: `Error occurred for option 2`',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Unregistered Options:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: 'Option `unregisterd_option_1` is not registered!',
            },
            {
              type: 'mrkdwn',
              text: 'Option `unregisterd_option_2` is not registered!',
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Invalid Typed Options:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: 'Option `invalid_type_option_1` got type `string`,\n                    but expected type `float`.',
            },
            {
              type: 'mrkdwn',
              text: 'Option `invalid_type_option_2` got type `float`,\n                    but expected type `int`.',
            },
          ],
        },
      ],
      channel: 'C05QM3AUDKJ',
      text: '',
      unfurl_links: false,
    });
  });
  it('writes drift only', async function () {
    const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    await messageSlack(testparitalpayload);
    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const message = postMessageSpy.mock.calls[0][0];
    expect(message).toEqual({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '❌ FAILED TO UPDATE in test_region: ❌',
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*DRIFTED OPTIONS:* ',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: '`drifted_option_1` drifted. value on db: `value_1`',
            },
            {
              type: 'mrkdwn',
              text: '`drifted_option_2` drifted. value on db: `value_2`',
            },
          ],
        },
      ],
      channel: 'C05QM3AUDKJ',
      text: '',
      unfurl_links: false,
    });
  });
});
