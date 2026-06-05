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
  const pullRequests = message.data.pull_requests ?? [];
  const prLinks = pullRequests.map(({ repo_name, pull_request }) => {
    const url = pull_request?.pr_url;
    const number = pull_request?.pr_number;
    const label =
      repo_name && number
        ? `${repo_name}#${number}`
        : repo_name || url || 'Autofix PR';
    return url ? `<${url}|${label}>` : label;
  });

  const issueLink = issueLinkFor(message.data.group_id);
  const multiple = prLinks.length > 1;
  const headerText = multiple ? 'Autofix opened PRs' : 'Autofix opened a PR';

  let body: string;
  if (prLinks.length <= 1) {
    const prLink = prLinks[0] ?? 'a PR';
    body = `:seer: ${prLink} for ${issueLink}`;
  } else {
    const list = prLinks.map((link) => `• ${link}`).join('\n');
    body = `:seer: PRs for ${issueLink}:\n${list}`;
  }

  return [
    slackblocks.header(slackblocks.plaintext(headerText)),
    slackblocks.section(slackblocks.markdown(body)),
  ];
}

// Autofix webhooks only reference the issue by its numeric `group_id`, so we
// build the issue URL ourselves from the configured org slug.
function issueLinkFor(groupId: number | undefined): string {
  if (groupId === undefined) {
    return 'the issue';
  }
  const url = `https://sentry.io/organizations/sentry/issues/${groupId}/`;
  return `<${url}|the issue>`;
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
