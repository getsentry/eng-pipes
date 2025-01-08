import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';
import { FastifyReply, FastifyRequest } from 'fastify';

import { DatadogEvent, GenericEvent, SlackMessage } from '@types';

import { bolt } from '@/api/slack';
import { DATADOG_API_INSTANCE } from '@/config';
import { EVENT_NOTIFIER_SECRETS } from '@/config/secrets';
import { extractAndVerifySignature } from '@/utils/auth/extractAndVerifySignature';

import { getService } from '../../utils/misc/serviceRegistry';

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
      reply.code(400).send('Invalid source or missing secret');
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
    for (const message of body.data) {
      if (message.type === 'slack') {
        await messageSlack(message);
      } else if (message.type === 'datadog') {
        await sendEventToDatadog(message, body.timestamp);
      }
    }
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
  message: DatadogEvent,
  timestamp: number
) {
  try {
    const params: v1.EventCreateRequest = {
      title: message.title,
      text: message.text,
      alertType: message.alertType,
      dateHappened: timestamp,
      tags: message.tags,
    };
    await DATADOG_API_INSTANCE.createEvent({ body: params });
  } catch (err) {
    Sentry.setContext('dd msg:', { text: message.text });
    Sentry.captureException(err);
  }
}

export async function messageSlack(message: SlackMessage) {
  let channels: string[] = [];
  if ('channels' in message) {
    channels = message.channels ?? [];
  } else if ('service_name' in message) {
    const service = getService(message.service_name);
    channels = service.alert_slack_channels ?? [];
  }
  for (const channel of channels) {
    try {
      const args = {
        channel: channel,
        blocks: message.blocks,
        text: message.text,
        unfurl_links: false,
      };
      if (message.blocks) {
        args.blocks = message.blocks;
      }
      await bolt.client.chat.postMessage(args);
    } catch (err) {
      Sentry.setContext('slack msg:', { text: message.text });
      Sentry.captureException(err);
    }
  }
}
