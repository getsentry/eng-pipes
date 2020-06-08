import { buildServer } from '@app/buildServer';

import payload from '@test/payloads/freight.json';

const mockInsert = jest.fn();
const mockTable = jest.fn(() => ({
  insert: mockInsert,
}));
const mockDataset = jest.fn(() => ({
  table: mockTable,
}));

// Mock octokit client
jest.mock('@app/api/github/getClient', () => ({
  getClient: jest.fn(() => ({
    repos: {
      compareCommits: jest.fn(() => require('@test/compareCommits.json')),
      listPullRequestsAssociatedWithCommit: jest.fn(({ commit_sha }) =>
        require(`@test/pr-${commit_sha}`)
      ),
    },
  })),
}));

jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function() {
    return {
      dataset: mockDataset,
    };
  },
}));

const SCHEMA = [
  { name: 'deploy_id', type: 'integer' },
  { name: 'pull_request_number', type: 'integer' },
  { name: 'commit_sha', type: 'string' },
];

describe('freight webhook', function() {
  let fastify;
  beforeEach(function() {
    fastify = buildServer();
  });

  afterEach(function() {
    mockTable.mockClear();
    mockInsert.mockClear();
    fastify.close();
  });

  it('correctly inserts freight webhook when deploy starts', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/freight/webhook',
      payload: { ...payload, date_finished: null },
    });

    expect(response.statusCode).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        event: 'deploy_started',
        meta: JSON.stringify({
          head_commit: 'c88d886ba52bd85431052abaef4916469f7db2e8',
          base_commit: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
        }),
        // Currently does not support PR ids
        object_id: null,
        source_id: 13,
        source: 'freight',
        start_timestamp: '2020-05-13T23:43:52Z',
        end_timestamp: null,
      },
      expect.anything()
    );
    expect(mockTable).toHaveBeenCalledTimes(1);
  });

  it('does not insert for staging environment', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/freight/webhook',
      payload: { ...payload, environment: 'staging' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('correctly inserts freight webhook when deploy finishes', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/freight/webhook',
      payload: {
        ...payload,
        status: 'finished',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        event: 'deploy_finished',
        meta: JSON.stringify({
          head_commit: 'c88d886ba52bd85431052abaef4916469f7db2e8',
          base_commit: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
        }),
        // Currently does not support PR ids
        object_id: null,
        source_id: 13,
        source: 'freight',
        start_timestamp: '2020-05-13T23:43:52Z',
        end_timestamp: '2020-05-15T20:59:02Z',
      },
      expect.anything()
    );

    // 2 commits
    expect(mockTable).toHaveBeenCalledTimes(3);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        commit_sha: 'c399a07b6ac176d9309eaa9240cb6e262b0ba04d',
        deploy_id: 13,
        pull_request_number: 19050,
      },
      {
        schema: SCHEMA,
      }
    );
    expect(mockInsert).toHaveBeenCalledWith(
      {
        commit_sha: 'ab65e75e4df9b0dfe715327738a6779f132fb1ae',
        deploy_id: 13,
        pull_request_number: 19047,
      },
      {
        schema: SCHEMA,
      }
    );
  });

  it('correctly inserts freight webhook when deploy fails', async function() {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/freight/webhook',
      payload: { ...payload, status: 'failed' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        event: 'deploy_failed',
        meta: JSON.stringify({
          head_commit: 'c88d886ba52bd85431052abaef4916469f7db2e8',
          base_commit: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
        }),
        // Currently does not support PR ids
        object_id: null,
        source_id: 13,
        source: 'freight',
        start_timestamp: '2020-05-13T23:43:52Z',
        end_timestamp: '2020-05-15T20:59:02Z',
      },
      expect.anything()
    );
    expect(mockTable).toHaveBeenCalledTimes(1);
  });
});
