import { insertOss } from '@utils/metrics';

/**
 * GitHub webhooks handler for OSS metrics
 */
export function ossMetrics({ name: eventType, payload }) {
  insertOss(eventType, payload);
}
