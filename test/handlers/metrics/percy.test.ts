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

import { buildServer } from '@app/buildServer';
import { TARGETS } from '@app/utils/db';

import payload from '@test/payloads/percy.json';

const SCHEMA = Object.entries(TARGETS.percy.schema).map(([name, type]) => ({
  name,
  type,
}));

describe('percy webhook', function () {
  let fastify;

  beforeEach(function () {
    fastify = buildServer();
  });

  afterEach(function () {
    mockTable.mockClear();
    mockInsert.mockClear();
    fastify.close();
  });

  it('correctly inserts percy webhook data', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/percy/webhook',
      payload: { ...payload },
    });

    expect(response.statusCode).toBe(200);
    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('percy');
    expect(mockInsert).toHaveBeenCalledWith(
      {
        branch: 'master',
        build_number: 54228,
        branch_url: 'https://github.com/getsentry/sentry/tree/master',
        event: 'finished',
        total: 354,
        diff: 0,
        end_timestamp: '2020-07-07T15:51:25.000Z',
        start_timestamp: '2020-07-07T15:30:27.000Z',
      },
      { schema: SCHEMA }
      // expect.anything()
    );
    expect(mockTable).toHaveBeenCalledTimes(1);
  });
});
