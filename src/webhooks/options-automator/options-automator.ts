import { KnownBlock, SectionBlock } from '@slack/types';
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
    slackblocks.section(slackblocks.markdown('*Updated options:* ')),
    slackblocks.SectionBlock(
      message.updated_options.map((option) =>
        slackblocks.markdown(
          `updated \`${option.option_name}\` with db value \`${option.db_value}\` and value \`${option.value}\``
        )
      )
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
    slackblocks.section(slackblocks.markdown('*Unset Options:* ')),
    slackblocks.SectionBlock(
      message.unset_options.map((option) =>
        slackblocks.markdown(`Unset \`${option}\``)
      )
    ),
  ];

  const failedBlock: KnownBlock[] = [
    slackblocks.header(slackblocks.plaintext('❌ FAILED TO UPDATE: ❌')),
    slackblocks.divider(),
    slackblocks.section(slackblocks.markdown('*DRIFTED OPTIONS:* ')),
    slackblocks.SectionBlock(
      message.drifted_options.map((option) =>
        slackblocks.markdown(`\`${option}\` drifted.`)
      )
    ),
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
    slackblocks.section(slackblocks.markdown('*Set Options:* ')),
    slackblocks.SectionBlock(
      message.set_options.map((option) =>
        slackblocks.markdown(
          `Set \`${option.option_name}\` with value \`${option.option_value}\``
        )
      )
    ),
  ];

  try {
    // @ts-ignore
    await bolt.client.chat.postMessage({
      blocks: successBlock,
      channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
      unfurl_links: false,
    });
    return await bolt.client.chat.postMessage({
      blocks: failedBlock,
      channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
      unfurl_links: false,
    });
  } catch (err) {
    console.log(err);
    return;
  }
}
