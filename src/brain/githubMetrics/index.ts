import { githubEvents } from '@api/github';
import { wrapHandler } from '@utils/wrapHandler';

import { ossMetrics } from './ossMetrics';
import { sentryMetrics } from './sentryMetrics';

// Handlers wrapped with Sentry transaction
const ossHandler = wrapHandler('metrics.oss', ossMetrics);
const sentryHandler = wrapHandler('metrics.sentry', sentryMetrics);

export async function githubMetrics() {
  githubEvents.removeListener('check_run', sentryHandler);
  githubEvents.on('check_run', sentryHandler);

  // @ts-ignore Missing in types
  githubEvents.removeListener('*', ossHandler);
  // This is for open source data so we can consolidate github webhooks
  // It does some data mangling in there, so we may want to extract that out of the
  // "db" utils
  githubEvents.onAny(ossHandler);
}
