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

import { verifyWebhook } from '~/src/webhooks/webpack/verifyWebhook';

import { buildServer } from '~/src/buildServer';
import * as db from '~/src/utils/metrics';

jest.spyOn(db, 'insertAssetSize');

jest.mock('~/src/webhooks/webpack/verifyWebhook', () => ({
  verifyWebhook: jest.fn(() => true),
}));

describe('webpack webhook', function () {
  let fastify;
  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(function () {
    fastify.close();
    (db.insertAssetSize as jest.Mock).mockClear();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
  });

  it('returns 400 if signature verification fails', async function () {
    // @ts-expect-error
    verifyWebhook.mockImplementationOnce(() => false);

    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/webpack/webhook',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(db.insertAssetSize).not.toHaveBeenCalled();
  });

  it('correctly inserts asset sizes from webhook', async function () {
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

    expect(response.statusCode).toBe(204);
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

  it('can insert payloads without a pull request number', async function () {
    const payload = {
      pull_request_number: false,
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

    expect(response.statusCode).toBe(204);
    expect(db.insertAssetSize).toHaveBeenCalled();
    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('asset_sizes');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ...payload,
        pull_request_number: -1,
      }),
      expect.anything()
    );
  });
});
