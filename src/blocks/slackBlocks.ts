import { KnownBlock, MrkdwnElement } from '@slack/types';

export function divider(): KnownBlock {
  return {
    type: 'divider',
  };
}

export function markdown(text: string): MrkdwnElement {
  return {
    type: 'mrkdwn',
    text,
  };
}

export function section(block: MrkdwnElement): KnownBlock {
  return {
    type: 'section',
    text: block,
  };
}
