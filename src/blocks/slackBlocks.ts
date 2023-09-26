import {
  HeaderBlock,
  KnownBlock,
  MrkdwnElement,
  PlainTextElement,
} from '@slack/types';

export function header(text: PlainTextElement): HeaderBlock {
  return {
    type: 'header',
    text,
  };
}

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

export function plaintext(text: string): PlainTextElement {
  return {
    type: 'plain_text',
    text,
  };
}

export function section(block: MrkdwnElement): KnownBlock {
  return {
    type: 'section',
    text: block,
  };
}

export function sectionBlock(fields: MrkdwnElement[]): KnownBlock {
  return {
    type: 'section',
    fields: fields,
  };
}

export function context(block: MrkdwnElement): KnownBlock {
  return {
    type: 'context',
    elements: [block],
  };
}
