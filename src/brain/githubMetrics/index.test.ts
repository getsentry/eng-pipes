import pullRequestPayload from '@test/payloads/github/pull_request';

const mockInsert = jest.fn(() => Promise.resolve());
const mockTable = jest.fn(() => ({
  insert: mockInsert,
}));
const mockDataset = jest.fn(() => ({
  table: mockTable,
}));

// Needs to be mocked before `@utils/metrics`
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function () {
    return {
      dataset: mockDataset,
    };
  },
}));

import { Fastify } from '@types';

import { createGitHubEvent } from '@test/utils/createGitHubEvent';

import { buildServer } from '@/buildServer';
import { getClient } from '@api/github/getClient';
import * as db from '@utils/metrics';

import { githubMetrics as metrics } from '.';

jest.spyOn(db, 'insert');
jest.spyOn(db, 'insertOss');
jest.mock('@api/github/getClient');

const SCHEMA = [
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
];

describe('github webhook', function () {
  let fastify: Fastify;
  let octokit;

  beforeEach(async function () {
    fastify = await buildServer(false);
    octokit = await getClient();
    metrics();
  });

  afterEach(function () {
    fastify.close();
    (db.insertOss as jest.Mock).mockClear();
    (db.insert as jest.Mock).mockClear();
    octokit.orgs.checkMembershipForUser.mockClear();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
  });

  it('does not call insert on dry run', async function () {
    process.env.DRY_RUN = '1';
    await createGitHubEvent(fastify, 'pull_request');
    expect(mockInsert).not.toHaveBeenCalled();
    delete process.env.DRY_RUN;
  });

  it('correctly inserts github pull request created webhook', async function () {
    const response = await createGitHubEvent(fastify, 'pull_request');

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
        user_type: null,
        username: 'Codertocat',
      },
      { schema: SCHEMA }
    );
  });

  it('correctly inserts github issue created webhook', async function () {
    const response = await createGitHubEvent(fastify, 'issues', {
      sender: { login: 'Gowron' },
    });

    expect(response.statusCode).toBe(200);
    expect(db.insertOss).toHaveBeenCalledWith('issues', expect.anything());
    expect(mockDataset).toHaveBeenCalledWith('open_source');
    expect(mockTable).toHaveBeenCalledWith('github_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        action: 'opened',
        created_at: '2019-05-15T15:20:18Z',
        object_id: 1,
        repository: 'Enterprise/Hello-World',
        type: 'issues',
        updated_at: '2019-05-15T15:20:18Z',
        user_id: 21031067,
        user_type: 'external',
        username: 'Gowron',
      },
      { schema: SCHEMA }
    );
  });

  it('correctly inserts github issue labeled webhook', async function () {
    const response = await createGitHubEvent(fastify, 'issues', {
      action: 'labeled',
      label: {
        id: 1362934389,
        node_id: 'MDU6TGFiZWwxMzYyOTM0Mzg5',
        url: 'https://api.github.com/repos/Enterprise/Hello-World/labels/bug',
        name: 'bug',
        color: 'd73a4a',
        default: true,
        description: "Something isn't working",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(db.insertOss).toHaveBeenCalledWith('issues', expect.anything());
    expect(mockDataset).toHaveBeenCalledWith('open_source');
    expect(mockTable).toHaveBeenCalledWith('github_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        action: 'labeled',
        created_at: '2019-05-15T15:20:18Z',
        object_id: 1,
        repository: 'Enterprise/Hello-World',
        type: 'issues',
        updated_at: '2019-05-15T15:20:18Z',
        user_id: 21031067,
        user_type: 'internal',
        username: 'Picard',
        target_type: 'label',
        target_id: 1362934389,
        target_name: 'bug',
      },
      { schema: SCHEMA }
    );
  });

  it('sees a bot for what it truly is, sneaky bot 👀', async function () {
    const response = await createGitHubEvent(fastify, 'issues', {
      sender: { login: 'human[bot]' },
    });

    expect(response.statusCode).toBe(200);
    expect(db.insertOss).toHaveBeenCalledWith('issues', expect.anything());
    expect(mockDataset).toHaveBeenCalledWith('open_source');
    expect(mockTable).toHaveBeenCalledWith('github_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        action: 'opened',
        created_at: '2019-05-15T15:20:18Z',
        object_id: 1,
        repository: 'Enterprise/Hello-World',
        type: 'issues',
        updated_at: '2019-05-15T15:20:18Z',
        user_id: 21031067,
        user_type: 'bot',
        username: 'human[bot]',
      },
      { schema: SCHEMA }
    );
  });

  it('does not insert unsupported webhook events', async function () {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await createGitHubEvent(
      fastify,
      // @ts-ignore
      'invalid',
      pullRequestPayload
    );

    expect(response.statusCode).toBe(200);
    expect(db.insertOss).toHaveBeenCalledWith('invalid', expect.anything());
    expect(mockDataset).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();

    // @ts-ignore
    console.warn.mockRestore();
  });

  it('correctly inserts github record for `check_run` webhooks', async function () {
    const response = await createGitHubEvent(fastify, 'check_run');

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
