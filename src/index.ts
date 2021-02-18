import 'module-alias/register';

import * as Sentry from '@sentry/node';

import { buildServer } from './buildServer';
import { DEFAULT_PORT } from './config';

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
}

main();
