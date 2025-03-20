import * as Sentry from '@sentry/node';
import type { KnownBlock } from '@slack/types';
import type { SentryInformerResponse } from '@types';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  SENTRY_INFORMER_WEBHOOK_SECRET,
  TRIAGE_INCIDENTS_CHANNED_ID,
} from '@/config';
import { extractAndVerifySignature } from '@/utils/auth/extractAndVerifySignature';

export async function sentryInformerWebhook(
  request: FastifyRequest<{ Body: SentryInformerResponse }>,
  reply: FastifyReply
): Promise<void> {
  try {
    if (SENTRY_INFORMER_WEBHOOK_SECRET === undefined) {
      throw new TypeError('SENTRY_INFORMER_WEBHOOK_SECRET must be set');
    }
    const isVerified = await extractAndVerifySignature(
      request,
      reply,
      'x-sentry-informer-signature',
      SENTRY_INFORMER_WEBHOOK_SECRET
    );

    if (!isVerified) {
      // If the signature is not verified, return (since extractAndVerifySignature sends the response)
      return;
    }

    const { body }: { body: SentryInformerResponse } = request;
    await messageSlack(body);
    reply.code(200).send('OK');
    return;
  } catch (err) {
    Sentry.captureException(err);
    reply.code(500).send();
    return;
  }
}

export async function messageSlack(message: SentryInformerResponse) {
  if (message.source !== 'sentry-informer') {
    return;
  }
  validatePayload(message);
  try {
    const sendBlock: KnownBlock[] = [
      slackblocks.header(slackblocks.plaintext('Production Access')),
    ];

    // Incident id might not be present when an SRE wants to escalate their privileges.
    if (message.incident_id) {
      sendBlock.push(
        slackblocks.section(
          slackblocks.markdown(
            message.action === 'escalated'
              ? `:alert-light: *${message.user}* has *${message.action}* privileges in region *${message.region}* for *${message.incident_id}*`
              : `:broom: *${message.user}* has *${message.action}* privileges in region *${message.region}* for *${message.incident_id}*`
          )
        )
      );
    } else {
      sendBlock.push(
        slackblocks.section(
          slackblocks.markdown(
            message.action === 'escalated'
              ? `:alert-light: *${message.user}* has *${message.action}* privileges in region *${message.region}*`
              : `:broom: *${message.user}* has *${message.action}* privileges in region *${message.region}*`
          )
        )
      );
    }

    await sendMessage(sendBlock);
  } catch (err) {
    Sentry.setContext('message_data', { message });
    Sentry.captureException(err);
  }
}

async function reportMessageError(
  message: SentryInformerResponse,
  errorMsg: string
) {
  Sentry.setContext('message_data', { message });
  Sentry.captureException(errorMsg);
}

function validatePayload(message: SentryInformerResponse) {
  const requiredFields = ['user', 'action'] as const;
  const missingFields = requiredFields.filter((field) => !message[field]);

  if (missingFields.length > 0) {
    const errorMsg = `Message is missing required fields: ${missingFields.join(
      ', '
    )}`;
    reportMessageError(message, errorMsg);
  }
}

async function sendMessage(blocks) {
  try {
    await bolt.client.chat.postMessage({
      channel: TRIAGE_INCIDENTS_CHANNED_ID,
      blocks: blocks,
      text: '',
      unfurl_links: false,
    });
  } catch (err) {
    Sentry.setContext('block:', { blocks });
    Sentry.captureException(err);
  }
}
