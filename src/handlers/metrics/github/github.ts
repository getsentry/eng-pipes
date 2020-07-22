import { FastifyRequest } from 'fastify';

import { insert, insertOss } from '../../../utils/db';

import { verifyWebhook } from './verifyWebhook';

const CHECK_STATUS_MAP = {
  in_progress: 'started',
  failure: 'failed',
  success: 'passed',
  cancelled: 'canceled',
};

export async function handler(request: FastifyRequest) {
  if (!verifyWebhook(request)) {
    throw new Error('Could not verify GitHub signature');
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

  const { check_run, check_suite } = payload;

  if (
    ['check_run', 'check_suite'].includes(eventType) &&
    (check_run || check_suite)
  ) {
    // The status is based on the combination of the conclusion and status
    const payloadObj = check_run || check_suite;
    const key = payloadObj.conclusion || payloadObj.status;
    const status = CHECK_STATUS_MAP[key] || key;

    const [pullRequest] = payloadObj.pull_requests;

    insert({
      source: 'github',
      event: `build_${status}`,
      object_id: pullRequest?.number,
      source_id: payloadObj.id,
      start_timestamp: payloadObj.started_at || payloadObj.created_at,
      // can be null if it has not completed yet
      end_timestamp: payloadObj.completed_at || payloadObj.updated_at || null,
      meta: {
        name: payloadObj.name || payloadObj.app?.name,
        head_commit: payloadObj.head_sha,
      },
    });
  }

  return {};
}
