import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';
import { KnownBlock, MrkdwnElement } from '@slack/types';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

import { SentryOptionsResponse } from '@types';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  DATADOG_API_INSTANCE,
  FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
  SENTRY_OPTIONS_WEBHOOK_SECRET,
} from '@/config';
import { verifySignature } from '@/utils/verifySignature';

export async function handler(
  request: FastifyRequest<{ Body: SentryOptionsResponse }>,
  reply: FastifyReply
) {
  try {
    const clientSignatureHeader =
      request.headers['x-sentry-options-signature'] ?? '';
    const clientSignature = Array.isArray(clientSignatureHeader)
      ? clientSignatureHeader.join('')
      : clientSignatureHeader;

    const isVerified = verifySignature(
      JSON.stringify(request.body),
      clientSignature,
      SENTRY_OPTIONS_WEBHOOK_SECRET,
      (i) => i,
      'sha256'
    );

    if (!isVerified) {
      return reply.code(401).send('Unauthorized');
    }

    const { body }: { body: SentryOptionsResponse } = request;
    await messageSlack(body);
    await sendSentryOptionsUpdatesToDatadog(body, moment().unix());
    return reply.code(200).send('OK');
  } catch (err) {
    Sentry.captureException(err);
    return reply.code(500).send();
  }
}

type OptionFormatter = (option: any) => string;
const MAX_BLOCK_SIZE = 10;

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
  const formatterMap: { [key: string]: OptionFormatter } = {
    drifted: (option) =>
      `\`${option.option_name}\` drifted. Value on db: \`${option.option_value}\``,
    updated: (option) =>
      `Updated \`${option.option_name}\` with db value \`${option.db_value}\` to value \`${option.value}\``,
    set: (option) =>
      `Set \`${option.option_name}\` to value \`${option.option_value}\``,
    unset: (option) => `Unset \`${option}\``,
    not_writable: (option) =>
      `Failed to update \`${option.option_name}\` \nreason: \`${option.error_msg}\``,
    unregistered: (option) => `Option \`${option}\` is not registered!`,
    invalid_type: (option) =>
      `Option \`${option.option_name}\` got type \`${option.got_type}\`, but expected type \`${option.expected_type}\`.`,
  };

  function generateBlock(option_type: string, options: any[]): KnownBlock[] {
    /**
     * This function generates a list of KnownBlocks, a type of SlackBlock.
     * If the given option_type does not fit into the formatterMap, report it as a sentry error.
     * This function also builds blocks around the options in batches of MAX_BLOCK_SIZE. Each
     * sectionBlock has a block limit.
     *
     */

    if (options.length === 0) {
      return [];
    }

    const blocks: KnownBlock[] = [];
    blocks.push(slackblocks.divider());

    if (formatterMap[option_type]) {
      blocks.push(
        ...createOptionBlocks(options, option_type, formatterMap[option_type])
      );
      return blocks;
    } else {
      Sentry.captureException(`unsupported option type: ${option_type}`);
      return [];
    }
  }

  function createOptionBlocks(
    options: any[],
    option_type: string,
    formatter: OptionFormatter
  ): KnownBlock[] {
    const block: KnownBlock[] = [];
    const header = `*${option_type.charAt(0).toUpperCase()}${option_type.slice(
      1
    )} Options:* `;
    for (let count = 0; count < options.length; count += MAX_BLOCK_SIZE) {
      block.push(slackblocks.section(slackblocks.markdown(header)));
      const batched_options: MrkdwnElement[] = [];
      for (
        let curr_batch = count;
        curr_batch < Math.min(count + MAX_BLOCK_SIZE, options.length);
        curr_batch += 1
      ) {
        batched_options.push(
          slackblocks.markdown(formatter(options[curr_batch]))
        );
      }
      block.push(slackblocks.sectionBlock(batched_options));
    }

    return block;
  }

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
      ...generateBlock('updated', message.updated_options),
      ...generateBlock('set', message.set_options),
      ...generateBlock('unset', message.unset_options),
    ];
    const failedBlock: KnownBlock[] = [
      slackblocks.header(
        slackblocks.plaintext(
          message.region
            ? `:warning: Failed to update in ${message.region}: :warning:`
            : ':warning: Failed to update :warning:'
        )
      ),
      ...generateBlock('drifted', message.drifted_options),
      ...generateBlock('not_writable', message.not_writable_options),
      ...generateBlock('unregistered', message.unregistered_options),
      ...generateBlock('invalid_type', message.invalid_type_options),
    ];
    if (successBlock.length > 1) {
      await sendMessage(successBlock);
    }
    if (failedBlock.length > 1) {
      await sendMessage(failedBlock);
    }
  } catch (err) {
    Sentry.setContext('message_data', { message });
    Sentry.captureException(err);
  }
}

async function sendMessage(blocks) {
  try {
    await bolt.client.chat.postMessage({
      channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
      blocks: blocks,
      text: '',
      unfurl_links: false,
    });
  } catch (err) {
    Sentry.setContext('block:', { blocks });
    Sentry.captureException(err);
  }
}
