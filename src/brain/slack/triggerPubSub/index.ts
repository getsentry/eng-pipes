import { TEAM_OSPO_CHANNEL_ID } from '@/config';
import {
  sendGitHubActivityMetrics,
  sendGitHubEngagementMetrics,
} from '@/jobs/slackScores/slackScores';
import { wrapHandler } from '@/utils/misc/wrapHandler';
import { bolt } from '@api/slack';

export const slackHandler = async ({ event }) => {
  const { channel, text } = event;
  if (channel !== TEAM_OSPO_CHANNEL_ID) {
    return;
  }
  if (text.includes('ttr')) {
    await sendGitHubEngagementMetrics(true);
  } else if (text.includes('activity')) {
    await sendGitHubActivityMetrics(true);
  }
};

export async function triggerPubSub() {
  bolt.event('app_mention', wrapHandler('slack-scores', slackHandler));
}
