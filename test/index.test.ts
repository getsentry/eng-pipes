import travisPayload from '@test/travis.json';

import { buildServer } from '@app/buildServer';
import { insert } from '@app/db';
import { verifyTravisWebhook } from '@app/verifyTravisWebhook';

jest.mock('@app/verifyTravisWebhook', () => ({
  verifyTravisWebhook: jest.fn(() => true),
}));

jest.mock('@app/db', () => ({
  insert: jest.fn(() => []),
}));

describe('travis webhook', function() {
  let fastify;
  beforeEach(function() {
    fastify = buildServer();
  });

  afterEach(function() {
    fastify.close();
  });

  it('correct inserts travis webhook', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/travis/webhook',
      payload: { payload: JSON.stringify(travisPayload) },
    });

    expect(response.statusCode).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      event: 'build_started',
      meta: {
        base_commit: '704b6b8cae9023275785f8a752025d117e788f38',
        head_commit: 'e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2',
        pull_request_title: 'update travis config',
      },
      object_id: 11,
      source_id: 684354870,
      source: 'travis',
      start_timestamp: '2020-05-13T23:43:52Z',
      end_timestamp: null,
    });

    expect(insert).toHaveBeenCalledWith({
      event: 'build_started',
      meta: {
        name: 'Backend',
        base_commit: '704b6b8cae9023275785f8a752025d117e788f38',
        head_commit: 'e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2',
        pull_request_title: 'update travis config',
      },
      object_id: 11,
      source_id: 684354871,
      parent_id: 684354870,
      source: 'travis',
      start_timestamp: '2020-05-13T23:43:52Z',
      end_timestamp: null,
    });

    expect(insert).toHaveBeenCalledWith({
      event: 'build_passed',
      meta: {
        name: 'Frontend [test]',
        base_commit: '704b6b8cae9023275785f8a752025d117e788f38',
        head_commit: 'e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2',
        pull_request_title: 'update travis config',
      },
      object_id: 11,
      source_id: 684354872,
      parent_id: 684354870,
      source: 'travis',
      start_timestamp: '2020-05-15T20:56:26Z',
      end_timestamp: '2020-05-15T20:59:02Z',
    });
  });
});
