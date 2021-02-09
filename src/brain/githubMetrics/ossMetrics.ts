import { EmitterWebhookEvent } from '@octokit/webhooks';

import { insertOss } from '@utils/metrics';

/**
 * GitHub webhooks handler for OSS metrics
 */
export function ossMetrics({ name: eventType, payload }: EmitterWebhookEvent) {
  insertOss(eventType, payload);
}
