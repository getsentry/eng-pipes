import travisPayload from '@test/payloads/travis.json';

import { buildServer } from '@app/buildServer';

const mockInsert = jest.fn(() => Promise.resolve());
const mockTable = jest.fn(() => ({
  insert: mockInsert,
}));
const mockDataset = jest.fn(() => ({
  table: mockTable,
}));

jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function() {
    return {
      dataset: mockDataset,
    };
  },
}));

jest.mock('@app/handlers/metrics/travis/verifyTravisWebhook', () => ({
  verifyTravisWebhook: jest.fn(() => true),
}));

const SCHEMA = [
  {
    name: 'object_id',
    type: 'integer',
  },
  {
    name: 'source_id',
    type: 'integer',
  },
  {
    name: 'parent_id',
    type: 'integer',
  },
  {
    name: 'event',
    type: 'string',
  },
  {
    name: 'source',
    type: 'string',
  },
  {
    name: 'start_timestamp',
    type: 'timestamp',
  },
  {
    name: 'end_timestamp',
    type: 'timestamp',
  },
  {
    name: 'meta',
    type: 'string',
  },
];

describe('travis webhook', function() {
  let fastify;
  beforeEach(function() {
    fastify = buildServer();
  });

  afterEach(function() {
    fastify.close();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
  });

  it('correctly inserts travis webhook', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/travis/webhook',
      payload: { payload: JSON.stringify(travisPayload) },
    });

    expect(response.statusCode).toBe(200);

    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('development_metrics');
    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'build_started',
        meta:
          '{"repo":"sentry","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":"update travis config"}',
        object_id: 11,
        source: 'travis',
        source_id: 684354870,
        start_timestamp: '2020-05-13T23:43:52Z',
      },
      {
        schema: SCHEMA,
      }
    );
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'build_started',
        meta:
          '{"name":"Backend","repo":"sentry","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":"update travis config"}',
        object_id: 11,
        parent_id: 684354870,
        source: 'travis',
        source_id: 684354871,
        start_timestamp: '2020-05-13T23:43:52Z',
      },
      {
        schema: SCHEMA,
      }
    );
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: '2020-05-15T20:59:02Z',
        event: 'build_passed',
        meta:
          '{"name":"Frontend [test]","repo":"sentry","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":"update travis config"}',
        object_id: 11,
        parent_id: 684354870,
        source: 'travis',
        source_id: 684354872,
        start_timestamp: '2020-05-15T20:56:26Z',
      },
      {
        schema: SCHEMA,
      }
    );
  });

  it('captures push events on main branch to a different repo', async function() {
    const payload = {
      ...travisPayload,
      type: 'push',
      branch: 'master',
      pull_request: false,
      pull_request_number: null,
      pull_request_title: null,
      repository: {
        id: 123,
        name: 'getsentry',
      },
    };
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/travis/webhook',
      payload: { payload: JSON.stringify(payload) },
    });

    expect(response.statusCode).toBe(200);

    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('development_metrics');
    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'build_started',
        meta:
          '{"repo":"getsentry","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":null}',
        object_id: null,
        source: 'travis-getsentry',
        source_id: 684354870,
        start_timestamp: '2020-05-13T23:43:52Z',
      },
      {
        schema: SCHEMA,
      }
    );
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'build_started',
        meta:
          '{"name":"Backend","repo":"getsentry","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":null}',
        object_id: null,
        parent_id: 684354870,
        source: 'travis-getsentry',
        source_id: 684354871,
        start_timestamp: '2020-05-13T23:43:52Z',
      },
      {
        schema: SCHEMA,
      }
    );
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: '2020-05-15T20:59:02Z',
        event: 'build_passed',
        meta:
          '{"name":"Frontend [test]","repo":"getsentry","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":null}',
        object_id: null,
        parent_id: 684354870,
        source: 'travis-getsentry',
        source_id: 684354872,
        start_timestamp: '2020-05-15T20:56:26Z',
      },
      {
        schema: SCHEMA,
      }
    );
  });

  it('ignores push events on non-main branches', async function() {
    const payload = {
      ...travisPayload,
      type: 'push',
      branch: 'test/ui/testing',
      pull_request: false,
      pull_request_number: null,
      pull_request_title: null,
    };
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/travis/webhook',
      payload: { payload: JSON.stringify(payload) },
    });

    expect(response.statusCode).toBe(200);

    expect(mockDataset).not.toHaveBeenCalled();
    expect(mockTable).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
