import { buildServer } from '@app/buildServer';

describe('index', function() {
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
      payload: { payload: {} },
    });

    expect(response.statusCode).toBe(404);
  });
});
