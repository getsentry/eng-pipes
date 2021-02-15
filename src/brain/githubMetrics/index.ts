import { githubEvents } from '@api/github';

import { ossMetrics } from './ossMetrics';
import { sentryMetrics } from './sentryMetrics';

export async function metrics() {
  githubEvents.removeListener('check_run', sentryMetrics);
  githubEvents.on('check_run', sentryMetrics);

  githubEvents.removeListener('*', ossMetrics);
  // This is for open source data so we can consolidate github webhooks
  // It does some data mangling in there, so we may want to extract that out of the
  // "db" utils
  githubEvents.onAny(ossMetrics);
}
