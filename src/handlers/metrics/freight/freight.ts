import { FastifyRequest } from 'fastify';

import { FreightPayload } from '../../../types';
// import { insert } from '../../../utils/db';

export async function handler(request: FastifyRequest) {
  const payload = JSON.parse(request.body.payload) as FreightPayload;

  console.log(payload);

  // Wait for actual data before inserting into db
  // await insert({
  // source: 'freight',
  // event: `build_${payload.state}`, // TODO: translate state --> string maybe
  // object_id: null, // TODO: Need to take sha/previous_sha and find the sentry commit
  // source_id: payload.deploy_number,
  // start_timestamp: payload.date_started,
  // // `finished_at` is null when it has not completed yet
  // end_timestamp: payload.date_finished,
  // meta: {
  // head_commit: payload.sha,
  // base_commit: payload.previous_sha,
  // },
  // });

  return {};
}
