import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';
import moment from 'moment-timezone';

import { GenericEvent } from '@types';

import { bolt } from '@/api/slack';
import { DATADOG_API_INSTANCE } from '@/config';
import { EVENT_NOTIFIER_SECRETS } from '@/config/secrets';
import { extractAndVerifySignature } from '@/utils/auth/extractAndVerifySignature';

export async function genericEventNotifier(
  request: FastifyRequest<{ Body: GenericEvent }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // If the webhook secret is not defined, throw an error
    const { body }: { body: GenericEvent } = request;
    if (
      body.source === undefined ||
      EVENT_NOTIFIER_SECRETS[body.source] === undefined
    ) {
      throw new Error('Invalid source or missing secret');
    }

    const isVerified = await extractAndVerifySignature(
      request,
      reply,
      'x-infra-hub-signature',
      EVENT_NOTIFIER_SECRETS[body.source]
    );
    if (!isVerified) {
      // If the signature is not verified, return (since extractAndVerifySignature sends the response)
      return;
    }

    await messageSlack(body);
    await sendEventToDatadog(body, moment().unix());
    reply.code(200).send('OK');
    return;
  } catch (err) {
    console.error(err);
    Sentry.captureException(err);
    reply.code(500).send();
    return;
  }
}

export async function sendEventToDatadog(
  message: GenericEvent,
  timestamp: number
) {
  if (message.data.channels.datadog) {
    const params: v1.EventCreateRequest = {
      title: message.data.title,
      text: message.data.message,
      alertType: message.data.misc.alertType,
      dateHappened: timestamp,
      tags: message.data.tags,
    };
    await DATADOG_API_INSTANCE.createEvent({ body: params });
  }
}

export async function messageSlack(message: GenericEvent) {
  if (message.data.channels.slack) {
    for (const channel of message.data.channels.slack) {
      const text = message.data.message;
      try {
        await bolt.client.chat.postMessage({
          channel: channel,
          blocks: message.data.misc.blocks,
          text: text,
          unfurl_links: false,
        });
      } catch (err) {
        Sentry.setContext('msg:', { text });
        Sentry.captureException(err);
      }
    }
  }
}
