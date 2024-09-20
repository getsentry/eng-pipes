import { createAppAuth } from '@octokit/auth-app';

import { GETSENTRY_ORG } from '@/config';
import { OctokitWithRetries as octokitClass } from '@api/github/octokitWithRetries';

import { GitHubOrgConfig } from '../../../lib/types/index';

import { GitHubOrg } from './org';

describe('constructor', function () {
  beforeAll(async function () {
    octokitClass.mockClear();
    new GitHubOrg('zerb', {
      appAuth: {
        appId: 423,
        privateKey: 'so secret',
        installationId: 432,
      },
    } as GitHubOrgConfig);
  });

  it('is instantiated once', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('is instantiated with appAuth', async function () {
    expect(octokitClass).toHaveBeenCalledWith({
      authStrategy: createAppAuth,
      auth: {
        appId: 423,
        privateKey: 'so secret',
        installationId: 432,
      },
    });
  });

  it('combines repos into .all', async function () {
    const org = new GitHubOrg('barn', {
      repos: {
        withRouting: ['cheese'],
        withoutRouting: ['bread'],
      },
    } as GitHubOrgConfig);
    expect(org.repos.all).toEqual(['cheese', 'bread']);
  });

  it('is fine without one of them', async function () {
    const org = new GitHubOrg('barn', {
      repos: {
        withRouting: ['cheese', 'wine'],
      },
    } as GitHubOrgConfig);
    expect(org.repos.all).toEqual(['cheese', 'wine']);
    expect(org.repos.withRouting).toEqual(['cheese', 'wine']);
    expect(org.repos.withoutRouting).toEqual([]);
  });
});

describe('helpers', function () {
  const org = GETSENTRY_ORG;

  it('addIssueToGlobalIssuesProject should return project item id from project', async function () {
    org.api = {
      graphql: jest
        .fn()
        .mockReturnValue({ addProjectV2ItemById: { item: { id: '12345' } } }),
    };
    expect(
      await org.addIssueToGlobalIssuesProject('issueNodeId', 'test-repo', 1)
    ).toEqual('12345');
  });

  it('getAllProjectFieldNodeIds should return timestamp from project', async function () {
    org.api = {
      graphql: jest.fn().mockReturnValue({
        node: {
          options: [
            { name: 'Waiting for: Product Owner', id: 1 },
            { name: 'Waiting for: Support', id: 2 },
            { name: 'Waiting for: Community', id: 3 },
          ],
        },
      }),
    };
    expect(await org.getAllProjectFieldNodeIds('projectFieldId')).toEqual({
      'Waiting for: Product Owner': 1,
      'Waiting for: Support': 2,
      'Waiting for: Community': 3,
    });
  });

  it('getKeyValueFromProjectField should return timestamp from project', async function () {
    org.api = {
      graphql: jest.fn().mockReturnValue({
        node: { fieldValueByName: { name: 'Product Area: Test' } },
      }),
    };
    expect(
      await org.getKeyValueFromProjectField('issueNodeId', 'fieldName')
    ).toEqual('Product Area: Test');
  });

  it('getIssueDueDateFromProject should return timestamp from project', async function () {
    org.api = {
      graphql: jest.fn().mockReturnValue({
        node: {
          fieldValues: {
            nodes: [
              {},
              {},
              {
                text: '2023-06-23T18:00:00.000Z',
                field: { id: org.project.fieldIds.responseDue },
              },
            ],
          },
        },
      }),
    };
    expect(await org.getIssueDueDateFromProject('issueNodeId')).toEqual(
      '2023-06-23T18:00:00.000Z'
    );
  });

  it('getIssueDetailsFromNodeId should return issue details', async function () {
    org.api = {
      graphql: jest.fn().mockReturnValue({
        node: { number: 1, repository: { name: 'test-repo' } },
      }),
    };
    expect(await org.getIssueDetailsFromNodeId('issueNodeId')).toEqual({
      number: 1,
      repo: 'test-repo',
    });
  });
});
