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
        slackblocks.header(slackblocks.plaintext('✅ Successfully Updated Options: ✅')),
        ...(message.channel_updated_options.length > 0
            ? [
                slackblocks.divider(),
                slackblocks.section(slackblocks.markdown('*Channel updated options:* ')),
                slackblocks.SectionBlock(
                message.channel_updated_options.map((option) =>
                    slackblocks.markdown(`channel updated \`${option}\``)
                )
                ),
            ]
            : []),
        ...(message.updated_options.length > 0
            ? [
                slackblocks.divider(),
                slackblocks.section(slackblocks.markdown('*Updated options:* ')),
                slackblocks.SectionBlock(
                message.updated_options.map((option) =>
                    slackblocks.markdown(
                    `updated \`${option.option_name}\` with db value \`${option.db_value}\` and value \`${option.value}\``
                    )
                )
                ),
            ]
            : []),
        ...(message.set_options.length > 0
            ? [
                slackblocks.divider(),
                slackblocks.section(slackblocks.markdown('*Set Options:* ')),
                slackblocks.SectionBlock(
                message.set_options.map((option) =>
                    slackblocks.markdown(
                    `Set \`${option.option_name}\` with value \`${option.option_value}\``
                    )
                )
                ),
            ]
            : []),
        ...(message.unset_options.length > 0
            ? [
                slackblocks.divider(),
                slackblocks.section(slackblocks.markdown('*Unset Options:* ')),
                slackblocks.SectionBlock(
                message.unset_options.map((option) =>
                    slackblocks.markdown(`Unset \`${option}\``)
                )
                ),
            ]
            : []),
    ];
    
    const failedBlock: KnownBlock[] = [
        slackblocks.header(slackblocks.plaintext('❌ FAILED TO UPDATE: ❌')),
        ...(message.drifted_options.length > 0
            ? [
                slackblocks.divider(),
                slackblocks.section(slackblocks.markdown('*DRIFTED OPTIONS:* ')),
                slackblocks.SectionBlock(
                message.drifted_options.map((option) =>
                    slackblocks.markdown(`\`${option}\` drifted.`)
                )
                ),
            ]
            : []),
        ...(message.error_options.length > 0
            ? [
                slackblocks.divider(),
                slackblocks.section(slackblocks.markdown('*FAILED:* ')),
                slackblocks.SectionBlock(
                message.error_options.map((option) =>
                    slackblocks.markdown(
                    `FAILED TO UPDATE \`${option.option_name}\` \nREASON: \`${option.error_msg}\``
                    )
                )
                ),
            ]
            : []),
        ...(message.set_options.length > 0
            ? [
                slackblocks.divider(),
                slackblocks.section(slackblocks.markdown('*Set Options:* ')),
                slackblocks.SectionBlock(
                message.set_options.map((option) =>
                    slackblocks.markdown(
                    `Set \`${option.option_name}\` with value \`${option.option_value}\``
                    )
            )
            ),
        ]
        : []),
    ];

    try {
        // @ts-ignore
        if (successBlock.length > 1) {
            await bolt.client.chat.postMessage({
              channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
              blocks: successBlock,
              text: "",
              unfurl_links: false,
            });
          }
        
          if (failedBlock.length > 1) {
            await bolt.client.chat.postMessage({
              channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
              blocks: failedBlock,
              text: "",
              unfurl_links: false,
            });
          }
        return; 
      } catch (err) {
        Sentry.captureException(err);
        return;
      }
}
