import * as Sentry from '@sentry/node';
import { Integrations } from '@sentry/tracing';
import { RewriteFrames } from '@sentry/integrations';

import { buildServer } from './buildServer';
import { DEFAULT_PORT, SENTRY_DSN } from './config';

Sentry.init({
  dsn: SENTRY_DSN,
  release: process.env.VERSION,
  integrations: [
    new Integrations.Express(),
    new RewriteFrames({ root: __dirname || process.cwd() }),
  ],
});

const server = buildServer();

server.listen(
  Number(process.env.PORT) || DEFAULT_PORT,
  '0.0.0.0',
  (err, address) => {
    if (err) {
      console.error(err);
      server.log.error(err);
      Sentry.captureException(err);
      process.exit(0);
    }
    server.log.info(`server listening on ${address}`);
  }
);
