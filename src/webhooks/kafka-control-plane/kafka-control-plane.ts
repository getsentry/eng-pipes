import * as Sentry from '@sentry/node';
import { KnownBlock } from '@slack/types';
import { FastifyReply, FastifyRequest } from 'fastify';

import { KafkaControlPlaneResponse } from '@types';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  KAFKA_CONTROL_PLANE_CHANNEL_ID,
  KAFKA_CONTROL_PLANE_WEBHOOK_SECRET,
} from '@/config';
import { extractAndVerifySignature } from '@/utils/extractAndVerifySignature';

export async function handler(
  request: FastifyRequest<{ Body: KafkaControlPlaneResponse }>,
  reply: FastifyReply
) {
  try {
    const isVerified = await extractAndVerifySignature(
      request,
      reply,
      'x-infra-event-notifier-signature',
      KAFKA_CONTROL_PLANE_WEBHOOK_SECRET!
    );

    if (!isVerified) {
      // If the signature is not verified, return (since extractAndVerifySignature sends the response)
      return;
    }

    const { body }: { body: KafkaControlPlaneResponse } = request;
    await messageSlack(body);
    return reply.code(200).send('OK');
  } catch (err) {
    Sentry.captureException(err);
    return reply.code(500).send();
  }
}

export async function messageSlack(message: KafkaControlPlaneResponse) {
  if (message.source !== 'kafka-control-plane') {
    return;
  }
  validatePayload(message);
  try {
    const sendBlock: KnownBlock[] = [
      slackblocks.header(slackblocks.plaintext(message.title)),
      slackblocks.section(slackblocks.markdown(message.body)),
    ];
    await sendMessage(sendBlock);
  } catch (err) {
    Sentry.setContext('message_data', { message });
    Sentry.captureException(err);
  }
}

async function reportMessageError(
  message: KafkaControlPlaneResponse,
  errorMsg: string
) {
  Sentry.setContext('message_data', { message });
  Sentry.captureException(errorMsg);
}

function validatePayload(message: KafkaControlPlaneResponse) {
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

async function sendMessage(blocks) {
  try {
    await bolt.client.chat.postMessage({
      channel: KAFKA_CONTROL_PLANE_CHANNEL_ID,
      blocks: blocks,
      text: '',
      unfurl_links: false,
    });
  } catch (err) {
    Sentry.setContext('block:', { blocks });
    Sentry.captureException(err);
  }
}