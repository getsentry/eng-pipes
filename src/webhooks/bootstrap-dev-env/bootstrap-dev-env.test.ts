const mockInsert = jest.fn(() => Promise.resolve());
const mockTable = jest.fn(() => ({
  insert: mockInsert,
}));
const mockDataset = jest.fn(() => ({
  table: mockTable,
}));

// Needs to be mocked before `app/utils/db`
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function () {
    return {
      dataset: mockDataset,
    };
  },
}));

import { buildServer } from '@/buildServer';
import * as db from '@utils/metrics';

jest.spyOn(db, 'insert');
jest.spyOn(db, 'insertOss');

describe('bootstrap-dev-env webhook', function () {
  let fastify;
  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(function () {
    fastify.close();
    (db.insertOss as jest.Mock).mockClear();
    (db.insert as jest.Mock).mockClear();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
  });

  it('correctly inserts bootstrap dev env started webhook', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/bootstrap-dev-env/webhook',
      payload: {
        name: 'meow',
        event: 'bootstrap_start',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(db.insert).toHaveBeenCalledWith({
      event: 'bootstrap_start',
      meta: {
        username: 'meow',
      },
      source: 'bootstrap-dev-env',
      start_timestamp: expect.any(Date),
      end_timestamp: null,
    });
    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('development_metrics');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'bootstrap_start',
        meta: '{"username":"meow"}',
        source: 'bootstrap-dev-env',
        start_timestamp: expect.any(Date),
      },
      {
        schema: [
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
          {
            name: 'sha',
            type: 'string',
          },
        ],
      }
    );
  });
});
