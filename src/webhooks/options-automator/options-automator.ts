import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';
import { FastifyRequest } from 'fastify';

import { OptionsAutomatorResponse } from '@types';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import { FEED_OPTIONS_AUTOMATOR_CHANNEL_ID } from '@/config';

export async function handler(
  request: FastifyRequest<{ Body: OptionsAutomatorResponse }>
) {
  const { body }: { body: OptionsAutomatorResponse } = request;
  await messageSlack(body);
  return {};
}

export async function messageSlack(message: OptionsAutomatorResponse) {
    const successBlock: KnownBlock[] = [
        ...(message.channel_updated_options.length > 0
          ? [
              slackblocks.header(
                slackblocks.plaintext('✅ Successfully Updated Options: ✅')
              ),
              slackblocks.divider(),
              slackblocks.section(slackblocks.markdown('*Channel updated options:* ')),
              slackblocks.SectionBlock(
                message.channel_updated_options.map((option) =>
                  slackblocks.markdown(`channel updated \`${option}\``)
                )
              ),
              slackblocks.divider(),
            ]
          : []),
        ...(message.updated_options.length > 0
          ? [
              slackblocks.header(
                slackblocks.plaintext('✅ Successfully Updated Options: ✅')
              ),
              slackblocks.divider(),
              slackblocks.section(slackblocks.markdown('*Updated options:* ')),
              slackblocks.SectionBlock(
                message.updated_options.map((option) =>
                  slackblocks.markdown(
                    `updated \`${option.option_name}\` with db value \`${option.db_value}\` and value \`${option.value}\``
                  )
                )
              ),
              slackblocks.divider(),
            ]
          : []),
        ...(message.set_options.length > 0
          ? [
              slackblocks.header(
                slackblocks.plaintext('✅ Successfully Updated Options: ✅')
              ),
              slackblocks.divider(),
              slackblocks.section(slackblocks.markdown('*Set Options:* ')),
              slackblocks.SectionBlock(
                message.set_options.map((option) =>
                  slackblocks.markdown(
                    `Set \`${option.option_name}\` with value \`${option.option_value}\``
                  )
                )
              ),
              slackblocks.divider(),
            ]
          : []),
        ...(message.unset_options.length > 0
          ? [
              slackblocks.header(
                slackblocks.plaintext('✅ Successfully Updated Options: ✅')
              ),
              slackblocks.divider(),
              slackblocks.section(slackblocks.markdown('*Unset Options:* ')),
              slackblocks.SectionBlock(
                message.unset_options.map((option) =>
                  slackblocks.markdown(`Unset \`${option}\``)
                )
              ),
              slackblocks.divider(),
            ]
          : []),
      ];
      
      const failedBlock: KnownBlock[] = [
        ...(message.drifted_options.length > 0
          ? [
              slackblocks.header(slackblocks.plaintext('❌ FAILED TO UPDATE: ❌')),
              slackblocks.divider(),
              slackblocks.section(slackblocks.markdown('*DRIFTED OPTIONS:* ')),
              slackblocks.SectionBlock(
                message.drifted_options.map((option) =>
                  slackblocks.markdown(`\`${option}\` drifted.`)
                )
              ),
              slackblocks.divider(),
            ]
          : []),
        ...(message.error_options.length > 0
          ? [
              slackblocks.header(slackblocks.plaintext('❌ FAILED TO UPDATE: ❌')),
              slackblocks.divider(),
              slackblocks.section(slackblocks.markdown('*FAILED:* ')),
              slackblocks.SectionBlock(
                message.error_options.map((option) =>
                  slackblocks.markdown(
                    `FAILED TO UPDATE \`${option.option_name}\` \nREASON: \`${option.error_msg}\``
                  )
                )
              ),
              slackblocks.divider(),
            ]
          : []),
        ...(message.set_options.length > 0
          ? [
              slackblocks.header(slackblocks.plaintext('❌ FAILED TO UPDATE: ❌')),
              slackblocks.divider(),
              slackblocks.section(slackblocks.markdown('*Set Options:* ')),
              slackblocks.SectionBlock(
                message.set_options.map((option) =>
                  slackblocks.markdown(
                    `Set \`${option.option_name}\` with value \`${option.option_value}\``
                  )
                )
              ),
              slackblocks.divider(),
            ]
          : []),
      ];

  try {
    // @ts-ignore
    await Promise.all([bolt.client.chat.postMessage({
      channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
      blocks: successBlock,
      text: "",
      unfurl_links: false,
    }), 
    bolt.client.chat.postMessage({
      channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
      blocks: failedBlock,
      text: "",
      unfurl_links: false,
    })]);
    return; 
  } catch (err) {
    Sentry.captureException(err);
    return;
  }
}
