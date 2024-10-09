import { EmitterWebhookEvent } from '@octokit/webhooks';

import { insertOss } from '@/utils/db/metrics';

/**
 * GitHub webhooks handler for OSS metrics
 */
export async function ossMetrics({
  name: eventType,
  payload,
}: EmitterWebhookEvent) {
  return await insertOss(eventType, payload);
}
