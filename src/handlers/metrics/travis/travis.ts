import { FastifyRequest } from 'fastify';

import { TravisPayload } from '../../../types';
import { insert } from '../../../utils/db';
import { verifyTravisWebhook } from './verifyTravisWebhook';

export async function handler(request: FastifyRequest) {
  try {
    if (!(await verifyTravisWebhook(request))) {
      throw new Error('Could not verify Travis signature');
    }
  } catch (err) {
    console.error(err);
    throw err;
  }

  const { config, ...payload } = JSON.parse(
    request.body.payload
  ) as TravisPayload;

  // Ignore non-main branches as we will use the pull_request event
  // since we need the pull request number
  if (payload.type === 'push' && payload.branch !== 'master') {
    return {};
  }

  // Ignore forks
  if (payload.repository.owner_name !== 'getsentry') {
    return {};
  }

  const source =
    payload.repository.name === 'sentry' ? 'travis' : 'travis-getsentry';

  await insert({
    source,
    event: `build_${payload.state}`,
    object_id: payload.pull_request_number, // null if not a pull request (e.g. master push)
    source_id: payload.id,
    // `finished_at` is null when it has not completed yet
    start_timestamp: payload.started_at,
    end_timestamp: payload.finished_at,
    meta: {
      repo: payload.repository.name,
      head_commit: payload.head_commit ?? payload.commit,
      base_commit: payload.base_commit ?? payload.commit,
      pull_request_title: payload.pull_request_title,
    },
  });

  // Save matrix builds
  await Promise.all(
    payload.matrix.map(({ config, ...matrixPayload }) =>
      insert({
        source,
        event: `build_${matrixPayload.state}`,
        object_id: payload.pull_request_number,
        source_id: matrixPayload.id,
        parent_id: matrixPayload.parent_id,
        // `finished_at` is null when it has not completed yet
        start_timestamp: matrixPayload.started_at,
        end_timestamp: matrixPayload.finished_at,
        meta: {
          name: config.name,
          repo: payload.repository.name,
          head_commit: payload.head_commit ?? payload.commit,
          base_commit: payload.base_commit ?? payload.commit,
          pull_request_title: payload.pull_request_title,
        },
      })
    )
  );

  return {};
}
