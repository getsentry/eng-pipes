import * as Sentry from '@sentry/node';

import { bolt } from '@/api/slack';
import { INFRA_HUB_HEARTBEAT_CHANNEL } from '@/config';

export async function heartbeat() {
  try {
    await bolt.client.chat.postMessage({
      channel: INFRA_HUB_HEARTBEAT_CHANNEL,
      text: 'Infra Hub is up',
    });
  } catch (err) {
    Sentry.captureException(err);
  }
}
