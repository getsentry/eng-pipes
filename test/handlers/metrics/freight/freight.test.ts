import payload from '@test/freight.json';

import { buildServer } from '@app/buildServer';
import { insert } from '@app/utils/db';

jest.mock('@utils/db', () => ({
  insert: jest.fn(() => []),
}));

describe.skip('freight webhook', function() {
  let fastify;
  beforeEach(function() {
    fastify = buildServer();
  });

  afterEach(function() {
    fastify.close();
  });

  it('correctly inserts freight webhook when deploy starts', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/freight/webhook',
      payload: { payload: JSON.stringify({ ...payload, date_finished: null }) },
    });

    expect(response.statusCode).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      event: 'started',
      meta: {
        base_commit: 'xyz',
        head_commit: 'abc',
      },
      // Currently does not support PR ids
      object_id: null,
      source_id: 13,
      source: 'freight',
      start_timestamp: '2020-05-13T23:43:52Z',
      end_timestamp: null,
    });
  });

  it('correctly inserts freight webhook when deploy finishes', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/freight/webhook',
      payload: {
        payload: JSON.stringify({
          ...payload,
          status: 'finished',
        }),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      event: 'passed',
      meta: {
        base_commit: 'xyz',
        head_commit: 'abc',
      },
      // Currently does not support PR ids
      object_id: null,
      source_id: 13,
      source: 'freight',
      start_timestamp: '2020-05-13T23:43:52Z',
      end_timestamp: '2020-05-15T20:59:02Z',
    });
  });

  it('correctly inserts freight webhook when deploy fails', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/freight/webhook',
      payload: { payload: JSON.stringify({ ...payload, status: 'failed' }) },
    });

    expect(response.statusCode).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      event: 'failed',
      meta: {
        base_commit: 'xyz',
        head_commit: 'abc',
      },
      // Currently does not support PR ids
      object_id: null,
      source_id: 13,
      source: 'freight',
      start_timestamp: '2020-05-13T23:43:52Z',
      end_timestamp: '2020-05-15T20:59:02Z',
    });
  });
});
