import travisPayload from '@test/travis.json';

import { buildServer } from '@app/buildServer';

describe('travis webhook', function() {
  let fastify;
  beforeEach(function() {
    fastify = buildServer();
  });

  afterEach(function() {
    fastify.close();
  });

  it('returns 404 when handler not found', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/..test/webhook',
      payload: { payload: JSON.stringify(travisPayload) },
    });

    expect(response.statusCode).toBe(404);
  });
});
