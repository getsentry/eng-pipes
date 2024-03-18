import * as Sentry from '@sentry/node';

import testAdminPayload from '@test/payloads/sentry-options/testAdminPayload.json';
import testBadPayload from '@test/payloads/sentry-options/testBadPayload.json';
import testEmptyPayload from '@test/payloads/sentry-options/testEmptyPayload.json';
import testMegaPayload from '@test/payloads/sentry-options/testMegaPayload.json';
import testPartialPayload from '@test/payloads/sentry-options/testPartialPayload.json';
import testPayload from '@test/payloads/sentry-options/testPayload.json';
import testSaasPayload from '@test/payloads/sentry-options/testSaasPayload.json';

import { buildServer } from '@/buildServer';
import { DATADOG_API_INSTANCE } from '@/config';
import { bolt } from '@api/slack';

import {
  messageSlack,
  sendSentryOptionsUpdatesToDatadog,
} from './sentry-options';

describe('sentry-options webhook', function () {
  let fastify, datadogApiInstanceSpy;
  beforeEach(async function () {
    fastify = await buildServer(false);
    datadogApiInstanceSpy = jest
      .spyOn(DATADOG_API_INSTANCE, 'createEvent')
      .mockImplementation(jest.fn());
  });

  afterEach(function () {
    fastify.close();
    jest.clearAllMocks();
  });

  it('correctly inserts sentry-options webhook when stage starts', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-options/webhook',
      payload: testEmptyPayload,
    });

    expect(response.statusCode).toBe(200);
  });

  describe('messageSlack tests', function () {
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('handles errors and reports to Sentry', async function () {
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      const sentrySetContextSpy = jest.spyOn(Sentry, 'setContext');
      await messageSlack(testBadPayload);
      expect(sentryCaptureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(sentrySetContextSpy).toHaveBeenCalledTimes(1);
      expect(sentrySetContextSpy.mock.calls[0][0]).toEqual(`message_data`);
      expect(sentrySetContextSpy.mock.calls[0][1]).toEqual({
        message: {
          drifted_options: [
            { bad_key_vaue: 'value_1', option_name: 'drifted_option_1' },
          ],
          region: 'bad',
          source: 'options-automator',
        },
      });
    });

    it('writes to slack', async function () {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(3);
      const firstMessage = postMessageSpy.mock.calls[0][0];
      const secondMessage = postMessageSpy.mock.calls[1][0];
      const thirdMessage = postMessageSpy.mock.calls[2][0];
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
              text: '*Drifted Options:* ',
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
              text: '*Failed Options:* ',
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
        ],
        channel: 'C05QM3AUDKJ',
        text: '',
        unfurl_links: false,
      });
      expect(thirdMessage).toEqual({
        blocks: [
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Invalid_typed Options:* ',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: 'Option `invalid_type_option_1` got type `string`, but expected type `float`.',
              },
              {
                type: 'mrkdwn',
                text: 'Option `invalid_type_option_2` got type `float`, but expected type `int`.',
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
      await messageSlack(testPartialPayload);
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
              text: '*Drifted Options:* ',
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

    it('only writes sentry-options changes', async function () {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testAdminPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });

    it('can handle more than the block size ', async function () {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testMegaPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendSentryOptionsUpdatesToDataDog tests', function () {
    it('should send the right payload', async function () {
      await sendSentryOptionsUpdatesToDatadog(testPartialPayload, 1699563828);
      expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(2);
      const message = datadogApiInstanceSpy.mock.calls[0][0];
      expect(message).toEqual({
        body: {
          dateHappened: 1699563828,
          text: '{"change":"drifted_options","option":{"option_name":"drifted_option_1","option_value":"value_1"}}',
          title: 'Sentry Options Update',
          alertType: 'error',
          tags: [
            'sentry_region:st-test_region',
            'source_tool:options-automator',
            'source:options-automator',
            'source_category:infra-tools',
            'option_name:drifted_option_1',
            `sentry_user:options-automator`,
          ],
        },
      });
      const secondMessage = datadogApiInstanceSpy.mock.calls[1][0];
      expect(secondMessage).toEqual({
        body: {
          dateHappened: 1699563828,
          text: '{"change":"drifted_options","option":{"option_name":"drifted_option_2","option_value":"value_2"}}',
          title: 'Sentry Options Update',
          alertType: 'error',
          tags: [
            'sentry_region:st-test_region',
            'source_tool:options-automator',
            'source:options-automator',
            'source_category:infra-tools',
            'option_name:drifted_option_2',
            `sentry_user:options-automator`,
          ],
        },
      });
    });
  });
  it('should send multiple messages', async function () {
    await sendSentryOptionsUpdatesToDatadog(testPayload, 1699563828);
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(13);
  });

  it('should handle different regions', async function () {
    await sendSentryOptionsUpdatesToDatadog(testSaasPayload, 1699563828);
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(1);

    const message = datadogApiInstanceSpy.mock.calls[0][0];
    expect(message).toEqual({
      body: {
        dateHappened: 1699563828,
        text: '{"change":"updated_options","option":{"option_name":"updated_option_1","db_value":"db_value_1","value":"new_value_1"}}',
        title: 'Sentry Options Update',
        alertType: 'success',
        tags: [
          'sentry_region:us',
          'source_tool:options-automator',
          'source:options-automator',
          'source_category:infra-tools',
          'option_name:updated_option_1',
          `sentry_user:options-automator`,
        ],
      },
    });
  });
});
