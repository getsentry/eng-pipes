const mockInsert = jest.fn();
const mockTable = jest.fn(() => ({
  insert: mockInsert,
}));
const mockDataset = jest.fn(() => ({
  table: mockTable,
}));

// Needs to be mocked before `app/utils/db`
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function() {
    return {
      dataset: mockDataset,
    };
  },
}));

import { buildServer } from '@app/buildServer';
import * as db from '@app/utils/db';
import { verifyWebhook } from '@app/handlers/metrics/webpack/verifyWebhook';

jest.spyOn(db, 'insertAssetSize');

jest.mock('@app/handlers/metrics/webpack/verifyWebhook', () => ({
  verifyWebhook: jest.fn(() => true),
}));

describe('webpack webhook', function() {
  let fastify;
  beforeEach(function() {
    fastify = buildServer();
  });

  afterEach(function() {
    fastify.close();
    (db.insertAssetSize as jest.Mock).mockClear();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
  });

  it('returns 400 if signature verification fails', async function() {
    // @ts-ignore
    verifyWebhook.mockImplementationOnce(() => false);
    // To keep logs clean since this is expected
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/webpack/webhook',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(db.insertAssetSize).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();

    // @ts-ignore
    console.error.mockRestore();
  });

  it('correctly inserts asset sizes from webhook', async function() {
    const payload = {
      pull_request_number: 123,
      commit: 'abc',
      file: 'app.js',
      entrypointName: 'app',
      node_env: 'production',
      size: 12345,
    };

    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/webpack/webhook',
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(db.insertAssetSize).toHaveBeenCalled();
    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('asset_sizes');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining(payload), {
      schema: [
        {
          name: 'pull_request_number',
          type: 'integer',
        },
        {
          name: 'commit',
          type: 'string',
        },
        {
          name: 'file',
          type: 'string',
        },
        {
          name: 'entrypointName',
          type: 'string',
        },
        {
          name: 'size',
          type: 'integer',
        },
        {
          name: 'environment',
          type: 'string',
        },
        {
          name: 'node_env',
          type: 'string',
        },
        {
          name: 'created_at',
          type: 'timestamp',
        },
      ],
    });
  });
});
