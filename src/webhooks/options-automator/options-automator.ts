import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';
import { FastifyRequest } from 'fastify';

import { bolt } from '~/api/slack';
import * as slackblocks from '~/blocks/slackBlocks';
import { FEED_OPTIONS_AUTOMATOR_CHANNEL_ID } from '~/config';
import { OptionsAutomatorResponse } from '~/types';

export async function handler(
  request: FastifyRequest<{ Body: OptionsAutomatorResponse }>
) {
  const { body }: { body: OptionsAutomatorResponse } = request;
  await messageSlack(body);
  return {};
}

export async function messageSlack(message: OptionsAutomatorResponse) {
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
          slackblocks.section(slackblocks.markdown('*Unregistered Options:* ')),
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

  try {
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
    Sentry.captureException(err);
  }
}
