import * as Sentry from '@sentry/node';
import { KnownBlock, MrkdwnElement } from '@slack/types';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import { FEED_OPTIONS_AUTOMATOR_CHANNEL_ID } from '@/config';
import { getUnregisteredOptions } from '@/utils/db/unregisteredOptions';

const MAX_BLOCK_SIZE = 10;

export async function sendUnregisteredOptionsSummary(): Promise<void> {
  try {
    const rows = await getUnregisteredOptions();

    if (rows.length === 0) {
      return;
    }

    const optionRegions: Map<string, Set<string>> = new Map();
    for (const row of rows) {
      if (!optionRegions.has(row.option_name)) {
        optionRegions.set(row.option_name, new Set());
      }
      optionRegions.get(row.option_name)!.add(row.region);
    }

    const sorted = [...optionRegions.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const blocks: KnownBlock[] = [
      slackblocks.header(
        slackblocks.plaintext('Daily Unregistered Options Summary')
      ),
      slackblocks.section(
        slackblocks.markdown(
          `*${optionRegions.size} unregistered option(s)* found across regions.\n` +
            `These options exist in \`sentry-options-automator\` but are not registered in \`sentry\`. ` +
            `Please remove them from the automator repo.`
        )
      ),
      slackblocks.divider(),
    ];

    for (let i = 0; i < sorted.length; i += MAX_BLOCK_SIZE) {
      const batch = sorted.slice(i, i + MAX_BLOCK_SIZE);
      const fields: MrkdwnElement[] = batch.map(([name, regions]) =>
        slackblocks.markdown(
          `\`${name}\`\n_regions: ${[...regions].sort().join(', ')}_`
        )
      );
      blocks.push(slackblocks.sectionBlock(fields));
    }

    await bolt.client.chat.postMessage({
      channel: FEED_OPTIONS_AUTOMATOR_CHANNEL_ID,
      blocks,
      text: `Daily summary: ${optionRegions.size} unregistered options`,
      unfurl_links: false,
    });
  } catch (err) {
    Sentry.captureException(err);
  }
}
