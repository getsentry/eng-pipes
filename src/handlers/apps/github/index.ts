import { IncomingMessage, Server, ServerResponse } from 'http';

import { FastifyInstance } from 'fastify';

import { web } from '@api/slack';
import { db } from '@utils/db';

import { metrics } from './brain/metrics';
import { metricsOss } from './brain/metricsOss';
import { requiredChecks } from './brain/requiredChecks';

export function createGithub(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  opts: any,
  done: () => void
) {
  metricsOss();
  metrics();
  requiredChecks();

  server.get('/test', {}, async (req, reply) => {
    const email = 'billy@sentry.io';
    const hasUser = await db('users').where('github_user', email).first('*');
    console.log(hasUser);

    if (!hasUser) {
      // Look up slack user via github email
      const results = await web.users.lookupByEmail({
        email,
      });

      reply.send(results);
      return;
    }

    reply.send({});
  });

  done();
}
