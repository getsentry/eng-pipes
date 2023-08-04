import { HeaderBlock, KnownBlock, MrkdwnElement, PlainTextElement } from '@slack/types';


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

export function section(block?: MrkdwnElement, fields?: MrkdwnElement[]): KnownBlock {
  if (block && fields) {
    return {
      type: 'section',
      text: block,
      fields: fields,
    };
  } else if (block) {
    return {
      type: 'section',
      text: block,
    };
  } else if (fields) {
    return {
      type: 'section',
      fields: fields,
    };
  } else {
    throw new Error('Either block or fields must be provided.');
  }
}
