import { createAppAuth } from '@octokit/auth-app';

import { GETSENTRY_ORG } from '@/config';
import { OctokitWithRetries as octokitClass } from '@api/github/octokitWithRetries';

import { GitHubOrg } from './org';

describe('constructor', function () {
  beforeAll(async function () {
    octokitClass.mockClear();
    await new GitHubOrg({
      appAuth: { appId: 'cheese please', privateKey: 'yes' },
    });
  });

  it('is instantiated once', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('is instantiated with appAuth', async function () {
    expect(octokitClass).toHaveBeenCalledWith({
      auth: { appId: 'cheese please', privateKey: 'yes' },
      authStrategy: createAppAuth,
    });
  });

  it('does not try to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(0);
  });
});

describe('bindAPI', function () {
  beforeAll(async function () {
    const org = await new GitHubOrg({
      slug: 'banana',
      appAuth: {
        appId: 422,
        privateKey: 'so private',
      },
    });
    octokitClass.mockClear();
    org.bindAPI();
  });

  it('is instantiated once again', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('tries to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(1);
  });

  it('is instantiated the second time with authStrategy and auth', async function () {
    expect(octokitClass).toHaveBeenLastCalledWith({
      authStrategy: createAppAuth,
      auth: {
        appId: 422,
        privateKey: 'so private',
        installationId: 'installation-banana',
      },
    });
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
                field: { id: org.project.response_due_date_field_id },
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
