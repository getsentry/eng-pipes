import { KnownBlock } from '@slack/types';

import * as slackblocks from '@/blocks/slackBlocks';
import { GOCD_ORIGIN } from '@/config';
import { GoCDPipeline } from '@/types';

export function stageMessage(pipeline: GoCDPipeline): string {
  const stage = pipeline.stage;
  switch (stage.result.toLowerCase()) {
    case 'unknown':
      return 'In progress';
    default:
      return stage.result;
  }
}

export function stageEmoji(pipeline: GoCDPipeline): string {
  const stage = pipeline.stage;
  switch (stage.result.toLowerCase()) {
    case 'passed':
      return '✅';
    case 'failed':
      return '❌';
    case 'cancelled':
      return '🛑';
    case 'unknown':
      return '⏳';
    default:
      return '❓';
  }
}

export function stageBlock(pipeline: GoCDPipeline): KnownBlock {
  const stageOverviewURL = `${GOCD_ORIGIN}/go/pipelines/${pipeline.name}/${pipeline.counter}/${pipeline.stage.name}/${pipeline.stage.counter}`;
  return {
    type: 'context',
    elements: [
      slackblocks.markdown(`${stageEmoji(pipeline)} *${pipeline.stage.name}*`),
      slackblocks.markdown(`<${stageOverviewURL}|${stageMessage(pipeline)}>`),
    ],
  };
}
