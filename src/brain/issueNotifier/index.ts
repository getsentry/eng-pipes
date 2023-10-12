import { EmitterWebhookEvent } from '@octokit/webhooks';

import { githubEvents } from '~/src/api/github';
import { bolt } from '~/src/api/slack';
import {
  PRODUCT_AREA_LABEL_PREFIX,
  SUPPORT_CHANNEL_ID,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '~/src/config';
import { db } from '~/src/utils/db';
import { wrapHandler } from '~/src/utils/wrapHandler';

export const getLabelsTable = () => db('label_to_channel');

export const githubLabelHandler = async ({
  payload: { issue, label },
}: EmitterWebhookEvent<'issues.labeled'>): Promise<void> => {
  if (!label) {
    return undefined;
  }

  let productAreaLabel: undefined | string;
  if (
    label.name.startsWith(PRODUCT_AREA_LABEL_PREFIX) &&
    issue.labels?.some(
      (label) => label.name === WAITING_FOR_PRODUCT_OWNER_LABEL
    )
  ) {
    productAreaLabel = label.name;
  } else if (label.name === WAITING_FOR_SUPPORT_LABEL) {
    bolt.client.chat.postMessage({
      text: `⏲ Issue ready to route: <${issue.html_url}|#${issue.number} ${issue.title}>`,
      channel: SUPPORT_CHANNEL_ID,
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  if (!productAreaLabel) {
    return undefined;
  }

  // We didn't want to artificially limit this to 1-to-N or N-to-1, as N-to-N
  // mapping for this makes sense. Even more, a "channel" can actually be a
  // group convo or a private chat with the bot.
  const channelsToNotify = (
    await getLabelsTable()
      .where({
        label_name: productAreaLabel,
      })
      .select('channel_id')
  ).map((row) => row.channel_id);
  const escapedIssueTitle = issue.title
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  await Promise.all(
    channelsToNotify.map((channel) =>
      bolt.client.chat.postMessage({
        text: `⏲ A wild issue has appeared! <${issue.html_url}|#${issue.number} ${escapedIssueTitle}>`,
        channel,
        unfurl_links: false,
        unfurl_media: false,
      })
    )
  );
};

export async function issueNotifier() {
  githubEvents.on(
    'issues.labeled',
    wrapHandler('issueNotifier', githubLabelHandler)
  );
}
