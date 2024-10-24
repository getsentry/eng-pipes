import { EmitterWebhookEvent } from '@octokit/webhooks';
import moment from 'moment-timezone';

import {
  GETSENTRY_ORG,
  PRODUCT_AREA_LABEL_PREFIX,
  SUPPORT_CHANNEL_ID,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { wrapHandler } from '@/utils/misc/wrapHandler';
import { getChannelsForIssue } from '@/utils/slack/getChannelsForIssue';
import { githubEvents } from '@api/github';
import { bolt } from '@api/slack';

export const githubLabelHandler = async ({
  payload: { issue, label, repository, organization },
}: EmitterWebhookEvent<'issues.labeled'>): Promise<void> => {
  if (!label) {
    return undefined;
  }

  let productAreaLabel: undefined | string;
  if (label.name.startsWith(PRODUCT_AREA_LABEL_PREFIX)) {
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
  const channelsToNotify = getChannelsForIssue(
    repository.name,
    organization?.login || GETSENTRY_ORG.slug,
    productAreaLabel.slice(PRODUCT_AREA_LABEL_PREFIX.length),
    moment.utc()
  );
  const escapedIssueTitle = issue.title
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  await Promise.all(
    channelsToNotify.map(({ channelId }) =>
      bolt.client.chat.postMessage({
        text: `⏲ A wild issue has appeared! <${issue.html_url}|#${issue.number} ${escapedIssueTitle}>`,
        channel: channelId,
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
