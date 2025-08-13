import * as Sentry from '@sentry/node';

import testAdminPayload from '@test/payloads/sentry-options/test-admin-payload.json';
import testBadPayload from '@test/payloads/sentry-options/test-bad-payload.json';
import testEmptyPayload from '@test/payloads/sentry-options/test-empty-payload.json';
import testLatencyPayload from '@test/payloads/sentry-options/test-latency-payload.json';
import testMegaPayload from '@test/payloads/sentry-options/test-mega-payload.json';
import testPartialPayload from '@test/payloads/sentry-options/test-partial-payload.json';
import testPayload from '@test/payloads/sentry-options/test-payload.json';
import testSaasPayload from '@test/payloads/sentry-options/test-saas-payload.json';
import { createSentryOptionsRequest } from '@test/utils/createSentryOptionsRequest';

import { buildServer } from '@/buildServer';
import { DATADOG_API_INSTANCE } from '@/config';
import { bolt } from '@api/slack';

import {
  messageSlack,
  sendSentryOptionsUpdatesToDatadog,
} from './sentry-options';

describe('sentry-options webhook', function () {
  it('noop', () => {});
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
    const response = await createSentryOptionsRequest(
      fastify,
      testEmptyPayload
    );
    expect(response.statusCode).toBe(200);
  });

  it('returns 401 for valid but incorrect signature', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-options/webhook',
      headers: {
        'x-sentry-options-signature':
          'd2c2e36b95268d0fc7965b2154fcb112b9578b9a9adbe5a38375d3253c971d6e',
      },
      payload: testPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for invalid signature', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-options/webhook',
      headers: {
        'x-sentry-options-signature': 'invalid',
      },
      payload: testPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for no signature', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/sentry-options/webhook',
      payload: testPayload,
    });
    expect(response.statusCode).toBe(400);
  });

  describe('messageSlack tests', function () {
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('handles errors and reports to Sentry', async function () {
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      const sentrySetContextSpy = jest.spyOn(Sentry, 'setContext');
      // expected error
      // @ts-expect-error
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
              text: '*Updated Options:* ',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: 'Updated `updated_option_1` with db value `db_value_1` to value `new_value_1`',
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
              text: ':warning: Failed to update in test_region: :warning:',
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
                text: '`drifted_option_1` drifted. Value on db: `value_1`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_2` drifted. Value on db: `value_2`',
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
              text: '*Not_writable Options:* ',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: 'Failed to update `error_option_1` \nreason: `Error occurred for option 1`',
              },
              {
                type: 'mrkdwn',
                text: 'Failed to update `error_option_2` \nreason: `Error occurred for option 2`',
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
              text: '*Invalid_type Options:* ',
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
              text: ':warning: Failed to update in test_region: :warning:',
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
                text: '`drifted_option_1` drifted. Value on db: `value_1`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_2` drifted. Value on db: `value_2`',
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
      const firstMessage = postMessageSpy.mock.calls[0][0];
      const secondMessage = postMessageSpy.mock.calls[1][0];
      expect(firstMessage).toEqual({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '✅ Successfully Updated Options in TESTING: ✅',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Updated Options:* ',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: 'Updated `update_1` with db value `value_2` to value `value_3`',
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
              text: ':warning: Failed to update in TESTING: :warning:',
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
                text: '`drifted_option_1` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_2` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_3` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_4` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_5` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_6` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_7` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_8` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_9` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_10` drifted. Value on db: `value_2`',
              },
            ],
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
                text: '`drifted_option_11` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_12` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_13` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_14` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_15` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_16` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_17` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_18` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_19` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_20` drifted. Value on db: `value_2`',
              },
            ],
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
                text: '`drifted_option_21` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_22` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_23` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_24` drifted. Value on db: `value_2`',
              },
              {
                type: 'mrkdwn',
                text: '`drifted_option_25` drifted. Value on db: `value_2`',
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

  it('should include latency_seconds tag when present', async function () {
    await sendSentryOptionsUpdatesToDatadog(testLatencyPayload, 1699563828);
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(2);

    // Check the drifted_options message
    const driftedMessage = datadogApiInstanceSpy.mock.calls[0][0];
    expect(driftedMessage).toEqual({
      body: {
        dateHappened: 1699563828,
        text: '{"change":"drifted_options","option":{"option_name":"drifted_option_1","option_value":"value_1"},"latency_seconds":2.5}',
        title: 'Sentry Options Update',
        alertType: 'error',
        tags: [
          'sentry_region:st-test_region',
          'source_tool:options-automator',
          'source:options-automator',
          'source_category:infra-tools',
          'option_name:drifted_option_1',
          'sentry_user:options-automator',
          'latency_seconds:2.5',
        ],
      },
    });

    // Check the updated_options message
    const updatedMessage = datadogApiInstanceSpy.mock.calls[1][0];
    expect(updatedMessage).toEqual({
      body: {
        dateHappened: 1699563828,
        text: '{"change":"updated_options","option":{"option_name":"updated_option_1","db_value":"db_value_1","value":"new_value_1"},"latency_seconds":2.5}',
        title: 'Sentry Options Update',
        alertType: 'success',
        tags: [
          'sentry_region:st-test_region',
          'source_tool:options-automator',
          'source:options-automator',
          'source_category:infra-tools',
          'option_name:updated_option_1',
          'sentry_user:options-automator',
          'latency_seconds:2.5',
        ],
      },
    });
  });

  it('should not include latency_seconds tag when not present', async function () {
    await sendSentryOptionsUpdatesToDatadog(testPartialPayload, 1699563828);
    expect(datadogApiInstanceSpy).toHaveBeenCalledTimes(2);

    // Check that no tags contain latency_seconds
    const firstMessage = datadogApiInstanceSpy.mock.calls[0][0];
    const secondMessage = datadogApiInstanceSpy.mock.calls[1][0];

    expect(firstMessage.body.tags).not.toContain(
      expect.stringMatching(/^latency_seconds:/)
    );
    expect(secondMessage.body.tags).not.toContain(
      expect.stringMatching(/^latency_seconds:/)
    );
  });
});
