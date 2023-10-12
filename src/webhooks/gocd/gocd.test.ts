import { buildServer } from '~/src/buildServer';
import gocdagentpayload from '~/test/payloads/gocd/gocd-agent.json';
import gocdstagepayload from '~/test/payloads/gocd/gocd-stage-building.json';

describe('gocd webhook', function () {
  let fastify;
  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(function () {
    fastify.close();
  });

  it('correctly inserts gocd webhook when stage starts', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      payload: gocdstagepayload,
    });

    expect(response.statusCode).toBe(200);

    // TODO (mattgauntseo-sentry): Check metric is stored correctly in
    // database
  });

  it('does nothing for agent updates', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      payload: gocdagentpayload,
    });

    expect(response.statusCode).toBe(200);
  });
});
