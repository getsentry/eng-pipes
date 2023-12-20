import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';
import { FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

import { SentryOptionsResponse } from '@types';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  DATADOG_API_INSTANCE,
  FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
} from '@/config';

export async function handler(
  request: FastifyRequest<{ Body: SentryOptionsResponse }>
) {
  const { body }: { body: SentryOptionsResponse } = request;
  await messageSlack(body);
  await sendSentryOptionsUpdatesToDatadog(body, moment().unix());
  return {};
}

export async function sendSentryOptionsUpdatesToDatadog(
  message: SentryOptionsResponse,
  timestamp: number
) {
  const formatRegionTag = (region: string): string => {
    const SAAS_REGIONS = ['us', 'de'];

    if (SAAS_REGIONS.includes(region)) {
      return `sentry_region:${region}`;
    } else {
      return `sentry_region:st-${region}`;
    }
  };

  const formatAlertType = (optionType: string): v1.EventAlertType => {
    return optionType === 'updated_options' ||
      optionType === 'set_options' ||
      optionType === 'unset_options'
      ? 'success'
      : 'error';
  };
  const region = formatRegionTag(message.region);

  for (const optionType in message) {
    if (optionType === 'region' || optionType === 'source') continue;
    for (const option of message[optionType]) {
      const text = {
        change: optionType,
        option: option,
      };

      const alertType = formatAlertType(optionType);

      const params: v1.EventCreateRequest = {
        title: 'Sentry Options Update',
        // TODO(getsentry/eng-pipes#706): Refactor Text Message
        text: JSON.stringify(text),
        alertType: alertType,
        dateHappened: timestamp,
        tags: [
          region,
          `source_tool:${message.source}`,
          `source:${message.source}`,
          `source_category:infra-tools`,
          `option_name:${option.option_name}`,
          `sentry_user:${message.source}`,
        ],
      };
      await DATADOG_API_INSTANCE.createEvent({ body: params });
    }
  }
}

export async function messageSlack(message: SentryOptionsResponse) {
  if (message.source !== 'options-automator') {
    return;
  }
  try {
    const successBlock: KnownBlock[] = [
      slackblocks.header(
        slackblocks.plaintext(
          message.region
            ? `✅ Successfully Updated Options in ${message.region}: ✅`
            : '✅ Successfully Updated Options ✅'
        )
      ),
      ...(message.updated_options.length > 0
        ? [
            slackblocks.divider(),
            slackblocks.section(slackblocks.markdown('*Updated options:* ')),
            slackblocks.sectionBlock(
              message.updated_options.map((option) =>
                slackblocks.markdown(
                  `updated \`${option.option_name}\` with db value \`${option.db_value}\` to value \`${option.value}\``
                )
              )
            ),
          ]
        : []),
      ...(message.set_options.length > 0
        ? [
            slackblocks.divider(),
            slackblocks.section(slackblocks.markdown('*Set Options:* ')),
            slackblocks.sectionBlock(
              message.set_options.map((option) =>
                slackblocks.markdown(
                  `Set \`${option.option_name}\` to value \`${option.option_value}\``
                )
              )
            ),
          ]
        : []),
      ...(message.unset_options.length > 0
        ? [
            slackblocks.divider(),
            slackblocks.section(slackblocks.markdown('*Unset Options:* ')),
            slackblocks.sectionBlock(
              message.unset_options.map((option) =>
                slackblocks.markdown(`Unset \`${option}\``)
              )
            ),
          ]
        : []),
    ];

    const failedBlock: KnownBlock[] = [
      slackblocks.header(
        slackblocks.plaintext(
          message.region
            ? `❌ FAILED TO UPDATE in ${message.region}: ❌`
            : '❌ FAILED TO UPDATE ❌'
        )
      ),
      ...(message.drifted_options.length > 0
        ? [
            slackblocks.divider(),
            slackblocks.section(slackblocks.markdown('*DRIFTED OPTIONS:* ')),
            slackblocks.sectionBlock(
              message.drifted_options.map((option) =>
                slackblocks.markdown(
                  `\`${option.option_name}\` drifted. value on db: \`${option.option_value}\``
                )
              )
            ),
          ]
        : []),
      ...(message.not_writable_options.length > 0
        ? [
            slackblocks.divider(),
            slackblocks.section(slackblocks.markdown('*FAILED:* ')),
            slackblocks.sectionBlock(
              message.not_writable_options.map((option) =>
                slackblocks.markdown(
                  `FAILED TO UPDATE \`${option.option_name}\` \nREASON: \`${option.error_msg}\``
                )
              )
            ),
          ]
        : []),
      ...(message.unregistered_options.length > 0
        ? [
            slackblocks.divider(),
            slackblocks.section(
              slackblocks.markdown('*Unregistered Options:* ')
            ),
            slackblocks.sectionBlock(
              message.unregistered_options.map((option) =>
                slackblocks.markdown(`Option \`${option}\` is not registered!`)
              )
            ),
          ]
        : []),
      ...(message.invalid_type_options.length > 0
        ? [
            slackblocks.divider(),
            slackblocks.section(
              slackblocks.markdown('*Invalid Typed Options:* ')
            ),
            slackblocks.sectionBlock(
              message.invalid_type_options.map((option) =>
                slackblocks.markdown(
                  `Option \`${option.option_name}\` got type \`${option.got_type}\`, 
                      but expected type \`${option.expected_type}\`.`
                )
              )
            ),
          ]
        : []),
    ];
    if (successBlock.length > 1) {
      await bolt.client.chat.postMessage({
        channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
        blocks: successBlock,
        text: '',
        unfurl_links: false,
      });
    }
    if (failedBlock.length > 1) {
      await bolt.client.chat.postMessage({
        channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
        blocks: failedBlock,
        text: '',
        unfurl_links: false,
      });
    }
  } catch (err) {
    Sentry.setContext('message_data', { message });
    Sentry.captureException(err);
  }
}
