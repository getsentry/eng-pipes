import { insertOss } from '@utils/db';
import { githubEvents } from '@api/github';

export async function metricsOss() {
  // This is for open source data so we can consolidate github webhooks
  // It does some data mangling in there, so we may want to extract that out of the
  // "db" utils
  githubEvents.onAny(({ name: eventType, payload }) => {
    insertOss(eventType, payload);
  });
}
