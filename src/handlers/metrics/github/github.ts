import { FastifyRequest } from 'fastify';

import { insert, insertOss } from '../../../utils/db';

import { verifyWebhook } from './verifyWebhook';

export async function handler(request: FastifyRequest) {
  try {
    // XXX: If this needs to scale better, we should investigate
    // into a middleware that processes a raw request body
    //
    // Currently we a parsed JSON object for body and there is no native way
    // in fastify to get the raw body.
    //
    // See https://github.com/fastify/fastify/issues/707
    if (!verifyWebhook(request)) {
      throw new Error('Could not verify GitHub signature');
    }
  } catch (err) {
    console.error(err);
    throw err;
  }

  const { body: payload } = request;
  const { 'x-github-event': eventType } = request.headers;

  if (eventType === 'ping') {
    return 'pong';
  }

  // This is for open source data so we can consolidate github webhooks
  // It does some data mangling in there, so we may want to extract that out of the
  // "db" utils
  insertOss(eventType, payload);

  const { check_run } = payload;

  if (eventType === 'check_run' && check_run) {
    const status =
      check_run.status === 'queued'
        ? 'queued'
        : check_run.status === 'in_progress'
        ? 'started'
        : check_run.conclusion === 'failure'
        ? 'failed'
        : check_run.conclusion === 'success'
        ? 'passed'
        : check_run.conclusion === 'cancelled'
        ? 'canceled'
        : check_run.conclusion;

    const [pullRequest] = check_run.pull_requests;

    insert({
      source: 'github',
      event: `build_${status}`,
      object_id: pullRequest?.number,
      source_id: check_run.id,
      start_timestamp: check_run.started_at,
      // can be null if it has not completed yet
      end_timestamp: check_run.completed_at,
      meta: {
        name: check_run.name,
        head_commit: check_run.head_sha,
      },
    });
  }

  return {};
}
