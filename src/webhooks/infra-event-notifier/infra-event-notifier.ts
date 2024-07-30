import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';
import { FastifyReply, FastifyRequest } from 'fastify';

import { InfraEventNotifierResponse } from '@types';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import { INFRA_EVENT_NOTIFIER_WEBHOOK_SECRET } from '@/config';
import { verifySignature } from '@/utils/verifySignature';

export async function handler(
  request: FastifyRequest<{ Body: InfraEventNotifierResponse }>,
  reply: FastifyReply
) {
  try {
    const clientSignatureHeader =
      request.headers['x-infra-event-notifier-signature'] ?? '';
    const clientSignature = Array.isArray(clientSignatureHeader)
      ? clientSignatureHeader.join('')
      : clientSignatureHeader;

    const payloadBody = request.body ? JSON.stringify(request.body) : '';
    const isVerified = verifySignature(
      payloadBody,
      clientSignature!,
      INFRA_EVENT_NOTIFIER_WEBHOOK_SECRET!,
      (i) => i,
      'sha256'
    );

    if (!isVerified) {
      return reply.code(401).send('Unauthorized');
    }

    const { body }: { body: InfraEventNotifierResponse } = request;
    await messageSlack(body);
    return reply.code(200).send('OK');
  } catch (err) {
    Sentry.captureException(err);
    return reply.code(500).send();
  }
}

export async function messageSlack(message: InfraEventNotifierResponse) {
  if (message.source !== 'infra-event-notifier') {
    return;
  }
  validatePayload(message);
  try {
    const sendBlock: KnownBlock[] = [
      slackblocks.header(slackblocks.plaintext(message.title)),
      slackblocks.section(slackblocks.markdown(message.body)),
    ];
    await sendMessage(sendBlock, message.channel);
  } catch (err) {
    Sentry.setContext('message_data', { message });
    Sentry.captureException(err);
  }
}

async function reportMessageError(
  message: InfraEventNotifierResponse,
  errorMsg: string
) {
  Sentry.setContext('message_data', { message });
  Sentry.captureException(errorMsg);
}

function validatePayload(message: InfraEventNotifierResponse) {
  const fields = [
    Object.hasOwn(message, 'title'),
    Object.hasOwn(message, 'body'),
    Object.hasOwn(message, 'channel'),
  ];

  // if any fields don't exist, report sentry error
  if (!fields.every(Boolean)) {
    let errorMsg = 'message is missing required fields: ';
    errorMsg += fields[0] ? 'title, ' : '';
    errorMsg += fields[1] ? 'body, ' : '';
    errorMsg += fields[2] ? 'channel' : '';
    reportMessageError(message, errorMsg);
    return;
  }

  if (message.body.length > 3000) {
    reportMessageError(message, 'body field length must be <3000 chars');
    return;
  }
}

async function sendMessage(blocks, channel_id: string) {
  try {
    await bolt.client.chat.postMessage({
      channel: channel_id,
      blocks: blocks,
      text: '',
      unfurl_links: false,
    });
  } catch (err) {
    Sentry.setContext('block:', { blocks });
    Sentry.captureException(err);
  }
}
