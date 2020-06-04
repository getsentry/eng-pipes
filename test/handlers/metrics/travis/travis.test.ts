import travisPayload from '@test/travis.json';

import { buildServer } from '@app/buildServer';

const mockInsert = jest.fn();
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
          '{"head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":"update travis config"}',
        object_id: 11,
        source: 'travis',
        source_id: 684354870,
        start_timestamp: '2020-05-13T23:43:52Z',
      },
      {
        schema:
          'object_id:integer,source_id:integer,parent_id:integer,event:string,source:string,start_timestamp:timestamp,end_timestamp:timestamp,meta:string',
      }
    );
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'build_started',
        meta:
          '{"name":"Backend","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":"update travis config"}',
        object_id: 11,
        parent_id: 684354870,
        source: 'travis',
        source_id: 684354871,
        start_timestamp: '2020-05-13T23:43:52Z',
      },
      {
        schema:
          'object_id:integer,source_id:integer,parent_id:integer,event:string,source:string,start_timestamp:timestamp,end_timestamp:timestamp,meta:string',
      }
    );
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: '2020-05-15T20:59:02Z',
        event: 'build_passed',
        meta:
          '{"name":"Frontend [test]","head_commit":"e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2","base_commit":"704b6b8cae9023275785f8a752025d117e788f38","pull_request_title":"update travis config"}',
        object_id: 11,
        parent_id: 684354870,
        source: 'travis',
        source_id: 684354872,
        start_timestamp: '2020-05-15T20:56:26Z',
      },
      {
        schema:
          'object_id:integer,source_id:integer,parent_id:integer,event:string,source:string,start_timestamp:timestamp,end_timestamp:timestamp,meta:string',
      }
    );
  });
});
