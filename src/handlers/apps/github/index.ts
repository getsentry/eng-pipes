import { FastifyInstance } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';

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

  done();
}
