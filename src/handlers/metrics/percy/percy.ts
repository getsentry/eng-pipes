import { FastifyRequest } from 'fastify';
import { insertPercy } from '@app/utils/db';

export async function handler(request: FastifyRequest) {
  // try {
  // if (!(await verifyTravisWebhook(request))) {
  // throw new Error('Could not verify Travis signature');
  // }
  // } catch (err) {
  // console.error(err);
  // throw err;
  // }

  // const { config, ...payload } = JSON.parse(
  // request.body.payload
  // ) as TravisPayload;

  // // Ignore non-main branches as we will use the pull_request event
  // // since we need the pull request number
  // if (payload.type === 'push' && payload.branch !== 'master') {
  // return {};
  // }

  // // Ignore forks
  // if (payload.repository.owner_name !== 'getsentry') {
  // return {};
  // }

  // const source =
  // payload.repository.name === 'sentry' ? 'travis' : 'travis-getsentry';

  const { body } = request;
  const { data } = body;

  const build = body.included.find(({ type }) => type === 'builds');

  await insertPercy({
    event: data.attributes.state,
    total: data.attributes['total-comparisons-finished'],
    diff: data.attributes['total-comparisons-diff'],
    branch: build?.attributes.branch,
    build_number: build?.attributes['build-number'],
    branch_url: build?.attributes['branch-html-url'],
    end_timestamp: build?.attributes['finished-at'],
    start_timestamp: build?.attributes['created-at'],
  });

  return {};
}
