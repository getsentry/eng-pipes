import { FastifyRequest } from 'fastify';

import { insert, insertOss } from '../../../utils/db';

import { verifyWebhook } from './verifyWebhook';

export async function handler(request: FastifyRequest) {
  try {
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
