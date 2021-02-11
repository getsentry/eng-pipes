import { githubEvents } from '@api/github';
import { insertOss } from '@utils/metrics';

function handler({ name: eventType, payload }) {
  insertOss(eventType, payload);
}

export async function metricsOss() {
  githubEvents.removeListener('*', handler);
  // This is for open source data so we can consolidate github webhooks
  // It does some data mangling in there, so we may want to extract that out of the
  // "db" utils
  githubEvents.onAny(handler);
}
