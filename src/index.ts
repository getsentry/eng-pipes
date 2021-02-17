import 'module-alias/register';

import { RewriteFrames } from '@sentry/integrations';
import * as Sentry from '@sentry/node';
import { Integrations } from '@sentry/tracing';

import { buildServer } from './buildServer';
import { DEFAULT_PORT, SENTRY_DSN } from './config';

async function main() {
  const server = await buildServer();

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
  //
  // Only enable in production
  if (process.env.ENV === 'production') {
    Sentry.init({
      dsn: SENTRY_DSN,
      release: process.env.VERSION,
      integrations: [
        // @ts-ignore
        new Integrations.Express({ app: server }),
        new RewriteFrames({ root: __dirname || process.cwd() }),
      ],
      tracesSampleRate: 1.0,
    });
  }
}

main();
