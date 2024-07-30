import gocdagentpayload from '@test/payloads/gocd/gocd-agent.json';
import gocdstagepayload from '@test/payloads/gocd/gocd-stage-building.json';
import { createGoCDRequest } from '@test/utils/createGoCDRequest';

import { buildServer } from '@/buildServer';

describe('gocd webhook', function () {
  let fastify;
  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(function () {
    fastify.close();
  });

  it('correctly inserts gocd webhook when stage starts', async function () {
    const response = await createGoCDRequest(fastify, gocdstagepayload);
    expect(response.statusCode).toBe(200);

    // TODO (mattgauntseo-sentry): Check metric is stored correctly in
    // database
  });

  it('does nothing for agent updates', async function () {
    const response = await createGoCDRequest(fastify, gocdagentpayload);
    expect(response.statusCode).toBe(200);
  });

  it('returns 400 if the signature is valid but incorrect', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      headers: {
        // Random sha256 hash
        'x-gocd-signature':
          'd2c2e36b95268d0fc7965b2154fcb112b9578b9a9adbe5a38375d3253c971d6e',
      },
      payload: gocdstagepayload,
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 if the signature is invalid', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      headers: {
        'x-gocd-signature': 'invalid',
      },
      payload: gocdstagepayload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 if no signature is provided', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
      payload: gocdstagepayload,
    });

    expect(response.statusCode).toBe(400);
  });
});
