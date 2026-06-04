import * as Sentry from '@sentry/node';
import type { KnownBlock } from '@slack/types';
import type { SentryAutofixWebhook } from '@types';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { bolt } from '@/api/slack';
import * as slackblocks from '@/blocks/slackBlocks';
import {
  FEED_AUTOFIX_CHANNEL_ID,
  SENTRY_AUTOFIX_WEBHOOK_SECRET,
} from '@/config';
import { extractAndVerifySignature } from '@/utils/auth/extractAndVerifySignature';

const PR_CREATED_ACTION = 'pr_created';

export async function sentryAutofixWebhook(
  request: FastifyRequest<{ Body: SentryAutofixWebhook }>,
  reply: FastifyReply
): Promise<void> {
  try {
    if (SENTRY_AUTOFIX_WEBHOOK_SECRET === undefined) {
      throw new TypeError('SENTRY_AUTOFIX_WEBHOOK_SECRET must be set');
    }
    const isVerified = await extractAndVerifySignature(
      request,
      reply,
      'sentry-hook-signature',
      SENTRY_AUTOFIX_WEBHOOK_SECRET
    );

    if (!isVerified) {
      Sentry.captureMessage(
        'Sentry Autofix webhook signature validation failed',
        'warning'
      );
      return;
    }

    const { body }: { body: SentryAutofixWebhook } = request;
    await messageSlack(body);
    reply.code(200).send('OK');
    return;
  } catch (err) {
    Sentry.captureException(err);
    reply.code(500).send();
    return;
  }
}

export async function messageSlack(message: SentryAutofixWebhook) {
  if (message.action !== PR_CREATED_ACTION) {
    return;
  }
  await sendMessage(buildBlocks(message));
}

function buildBlocks(message: SentryAutofixWebhook): KnownBlock[] {
  const pr = message.data.pull_request ?? {};
  const issue = message.data.issue ?? {};

  const prLabel = pr.title || pr.url || 'Autofix PR';
  const prLink = pr.url ? `<${pr.url}|${prLabel}>` : prLabel;

  const issueLabel = issue.short_id || issue.title || 'issue';
  const issueLink = issue.web_url
    ? `<${issue.web_url}|${issueLabel}>`
    : issueLabel;

  const repoSuffix = pr.repository ? ` in \`${pr.repository}\`` : '';

  return [
    slackblocks.header(slackblocks.plaintext('Autofix opened a PR')),
    slackblocks.section(
      slackblocks.markdown(`:seer: ${prLink} for ${issueLink}${repoSuffix}`)
    ),
  ];
}

async function sendMessage(blocks: KnownBlock[]) {
  try {
    await bolt.client.chat.postMessage({
      channel: FEED_AUTOFIX_CHANNEL_ID,
      blocks,
      text: 'Autofix opened a PR',
      unfurl_links: false,
    });
  } catch (err) {
    Sentry.setContext('block:', { blocks });
    Sentry.captureException(err);
  }
}
