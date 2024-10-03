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

import { createGitHubEvent } from '@test/utils/github';
import { MockedGitHubAPI } from '@test/utils/testTypes';

import { buildServer } from '@/buildServer';
import { DRY_RUN, GETSENTRY_ORG } from '@/config';
import * as dbFunctions from '@/utils/db/metrics';

import { githubMetrics as metrics } from '.';

jest.spyOn(dbFunctions, 'insert');
jest.spyOn(dbFunctions, 'insertOss');
jest.mock('@/config', () => {
  const actualEnvVariables = jest.requireActual('@/config');
  return { ...actualEnvVariables, DRY_RUN: false };
});

const SCHEMA = Object.entries(dbFunctions.TARGETS.oss.schema).map(
  ([name, type]) => ({
    name,
    type,
  })
);

describe('github webhook', function () {
  let fastify: Fastify;
  const org = GETSENTRY_ORG as unknown as { api: MockedGitHubAPI };

  beforeEach(async function () {
    fastify = await buildServer(false);
    metrics();
  });

  afterEach(function () {
    fastify.close();
    (dbFunctions.insertOss as jest.Mock).mockClear();
    (dbFunctions.insert as jest.Mock).mockClear();
    org.api.orgs.checkMembershipForUser.mockClear();
    mockDataset.mockClear();
    mockTable.mockClear();
    mockInsert.mockClear();
  });

  it('does not call insert on dry run', async function () {
    // @ts-ignore
    DRY_RUN = true;
    await createGitHubEvent(fastify, 'pull_request');
    expect(mockInsert).not.toHaveBeenCalled();
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    DRY_RUN = false;
  });

  it('correctly inserts github pull request created webhook', async function () {
    const response = await createGitHubEvent(fastify, 'pull_request');

    expect(response.statusCode).toBe(200);
    expect(dbFunctions.insertOss).toHaveBeenCalledWith(
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
        timeToTriageBy: null,
        timeToRouteBy: null,
        product_area: null,
        teams: [],
      },
      { schema: SCHEMA }
    );
  });

  it('correctly inserts github issue created webhook', async function () {
    const response = await createGitHubEvent(fastify, 'issues', {
      sender: { login: 'Gowron' },
    });

    expect(response.statusCode).toBe(200);
    expect(dbFunctions.insertOss).toHaveBeenCalledWith(
      'issues',
      expect.anything()
    );
    expect(mockDataset).toHaveBeenCalledWith('open_source');
    expect(mockTable).toHaveBeenCalledWith('github_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        action: 'opened',
        created_at: '2019-05-15T15:20:18Z',
        object_id: 1,
        repository: 'getsentry/Hello-World',
        type: 'issues',
        updated_at: '2019-05-15T15:20:18Z',
        user_id: 21031067,
        user_type: 'external',
        username: 'Gowron',
        timeToTriageBy: null,
        timeToRouteBy: null,
        product_area: null,
        teams: ['team-ospo'],
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
        url: 'https://api.github.com/repos/getsentry/Hello-World/labels/bug',
        name: 'bug',
        color: 'd73a4a',
        default: true,
        description: "Something isn't working",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(dbFunctions.insertOss).toHaveBeenCalledWith(
      'issues',
      expect.anything()
    );
    expect(mockDataset).toHaveBeenCalledWith('open_source');
    expect(mockTable).toHaveBeenCalledWith('github_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        action: 'labeled',
        created_at: '2019-05-15T15:20:18Z',
        object_id: 1,
        repository: 'getsentry/Hello-World',
        type: 'issues',
        updated_at: '2019-05-15T15:20:18Z',
        user_id: 21031067,
        user_type: 'internal',
        username: 'Picard',
        target_type: 'label',
        target_id: 1362934389,
        target_name: 'bug',
        timeToTriageBy: null,
        timeToRouteBy: null,
        product_area: null,
        teams: ['team-ospo'],
      },
      { schema: SCHEMA }
    );
  });

  it('sees a bot for what it truly is, sneaky bot 👀', async function () {
    const response = await createGitHubEvent(fastify, 'issues', {
      sender: { login: 'human[bot]' },
    });

    expect(response.statusCode).toBe(200);
    expect(dbFunctions.insertOss).toHaveBeenCalledWith(
      'issues',
      expect.anything()
    );
    expect(mockDataset).toHaveBeenCalledWith('open_source');
    expect(mockTable).toHaveBeenCalledWith('github_events');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        action: 'opened',
        created_at: '2019-05-15T15:20:18Z',
        object_id: 1,
        repository: 'getsentry/Hello-World',
        type: 'issues',
        updated_at: '2019-05-15T15:20:18Z',
        user_id: 21031067,
        user_type: 'bot',
        username: 'human[bot]',
        timeToTriageBy: null,
        timeToRouteBy: null,
        product_area: null,
        teams: ['team-ospo'],
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
    expect(dbFunctions.insertOss).toHaveBeenCalledWith(
      'invalid',
      expect.anything()
    );
    expect(mockDataset).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();

    // @ts-ignore
    console.warn.mockRestore();
  });

  it('correctly inserts github record for `check_run` webhooks', async function () {
    const response = await createGitHubEvent(fastify, 'check_run');

    expect(response.statusCode).toBe(200);
    expect(dbFunctions.insert).toHaveBeenCalledWith({
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
      sha: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
    });
    expect(mockDataset).toHaveBeenCalledWith('product_eng');
    expect(mockTable).toHaveBeenCalledWith('development_metrics');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      {
        end_timestamp: null,
        event: 'build_queued',
        meta: '{"type":"check_run","name":"Octocoders-linter","head_commit":"ec26c3e57ca3a959ca5aad62de7213c562f8c821","base_commit":"f95f852bd8fca8fcc58a9a2d6c842781e32a215f","repo":"Codertocat/Hello-World","branch":"changes"}',
        object_id: 3,
        source: 'github',
        source_id: 128620228,
        start_timestamp: '2019-05-15T15:21:12Z',
        sha: 'ec26c3e57ca3a959ca5aad62de7213c562f8c821',
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
