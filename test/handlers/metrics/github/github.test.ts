import pullRequestPayload from '@test/payloads/github/pullRequest.json';
import checkRunPayload from '@test/payloads/github/checkRun.json';

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
import * as db from '@app/utils/db';
import { createSignature } from '@utils/createSignature';

jest.spyOn(db, 'insert');
jest.spyOn(db, 'insertOss');

describe('github webhook', function () {
  let fastify;
  const signature = createSignature(
    JSON.stringify(pullRequestPayload),
    process.env.GH_WEBHOOK_SECRET || '',
    (i) => `sha1=${i}`
  ).toString();
  beforeEach(function () {
    fastify = buildServer();
  });

  afterEach(function () {
    fastify.close();
    (db.insertOss as jest.Mock).mockClear();
    (db.insert as jest.Mock).mockClear();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
  });

  it('does not call insert on dry run', async function () {
    process.env.DRY_RUN = '1';
    await fastify.inject({
      method: 'POST',
      url: '/metrics/github/webhook',
      headers: {
        'x-github-delivery': 1234,
        'x-github-event': 'pull_request',
        'x-hub-signature': signature,
      },
      payload: pullRequestPayload,
    });
    expect(mockInsert).not.toHaveBeenCalled();
    delete process.env.DRY_RUN;
  });

  it('correctly inserts github pull request created webhook', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/github/webhook',
      headers: {
        'x-github-delivery': 1234,
        'x-github-event': 'pull_request',
        'x-hub-signature': signature,
      },
      payload: pullRequestPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(db.insertOss).toHaveBeenCalledWith(
      'pull_request',
      expect.anything()
    );
    expect(mockDataset).toHaveBeenCalledWith('open_source');
    expect(mockTable).toHaveBeenCalledWith('github_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        action: 'opened',
        created_at: '2019-05-15T15:20:33Z',
        object_id: 2,
        repository: 'Codertocat/Hello-World',
        type: 'pull_request',
        updated_at: '2019-05-15T15:20:33Z',
        user_id: 21031067,
        username: 'Codertocat',
      },
      {
        schema: [
          {
            name: 'type',
            type: 'STRING',
          },
          {
            name: 'action',
            type: 'STRING',
          },
          {
            name: 'username',
            type: 'STRING',
          },
          {
            name: 'user_id',
            type: 'INT64',
          },
          {
            name: 'repository',
            type: 'STRING',
          },
          {
            name: 'object_id',
            type: 'INT64',
          },
          {
            name: 'created_at',
            type: 'TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'TIMESTAMP',
          },
          {
            name: 'target_id',
            type: 'INT64',
          },
          {
            name: 'target_name',
            type: 'STRING',
          },
          {
            name: 'target_type',
            type: 'STRING',
          },
        ],
      }
    );
  });

  it('does not insert unsupported webhook events', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/github/webhook',
      headers: {
        'x-github-delivery': 1234,
        'x-github-event': 'invalid',
        'x-hub-signature': signature,
      },
      payload: pullRequestPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(db.insertOss).toHaveBeenCalledWith('invalid', expect.anything());
    expect(mockDataset).not.toHaveBeenCalled();
  });

  it('correctly inserts github record for `check_run` webhooks', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/github/webhook',
      headers: {
        'x-github-delivery': 1234,
        'x-github-event': 'check_run',
        'x-hub-signature': createSignature(
          JSON.stringify(checkRunPayload),
          process.env.GH_WEBHOOK_SECRET || '',
          (i) => `sha1=${i}`
        ),
      },
      payload: checkRunPayload,
    });
    expect(response.statusCode).toBe(200);
    expect(db.insert).toHaveBeenCalledWith({
      event: 'build_queued',
      meta: {
        type: 'check_run',
        name: 'Octocoders-linter',
        head_commit: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
        base_commit: 'f95f852bd8fca8fcc58a9a2d6c842781e32a215f',
        branch: 'changes',
        repo: 'Codertocat/Hello-World',
      },
      object_id: 3,
      source_id: 128620228,
      source: 'github',
      start_timestamp: '2019-05-15T15:21:12Z',
      end_timestamp: null,
    });
    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('development_metrics');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'build_queued',
        meta:
          '{"type":"check_run","name":"Octocoders-linter","head_commit":"ec26c3e57ca3a959ca5aad62de7213c562f8c821","base_commit":"f95f852bd8fca8fcc58a9a2d6c842781e32a215f","repo":"Codertocat/Hello-World","branch":"changes"}',
        object_id: 3,
        source: 'github',
        source_id: 128620228,
        start_timestamp: '2019-05-15T15:21:12Z',
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
        ],
      }
    );
  });
});
