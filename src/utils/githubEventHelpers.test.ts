import { GH_APPS } from '@/config';

import * as githubEventHelpers from './githubEventHelpers';

describe('githubEventHelpers', function () {
  const app = GH_APPS.load('__tmp_org_placeholder__');

  it('addIssueToGlobalIssuesProject should return project item id from project', async function () {
    const octokit = {
      graphql: jest
        .fn()
        .mockReturnValue({ addProjectV2ItemById: { item: { id: '12345' } } }),
    };
    expect(
      await githubEventHelpers.addIssueToGlobalIssuesProject(
        app,
        'issueNodeId',
        'test-repo',
        1,
        octokit
      )
    ).toEqual('12345');
  });

  it('getAllProjectFieldNodeIds should return timestamp from project', async function () {
    const octokit = {
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
    expect(
      await githubEventHelpers.getAllProjectFieldNodeIds(
        'projectFieldId',
        octokit
      )
    ).toEqual({
      'Waiting for: Product Owner': 1,
      'Waiting for: Support': 2,
      'Waiting for: Community': 3,
    });
  });

  it('getKeyValueFromProjectField should return timestamp from project', async function () {
    const octokit = {
      graphql: jest.fn().mockReturnValue({
        node: { fieldValueByName: { name: 'Product Area: Test' } },
      }),
    };
    expect(
      await githubEventHelpers.getKeyValueFromProjectField(
        'issueNodeId',
        'fieldName',
        octokit
      )
    ).toEqual('Product Area: Test');
  });

  it('getIssueDueDateFromProject should return timestamp from project', async function () {
    const octokit = {
      graphql: jest.fn().mockReturnValue({
        node: {
          fieldValues: {
            nodes: [
              {},
              {},
              {
                text: '2023-06-23T18:00:00.000Z',
                field: { id: app.project.response_due_date_field_id },
              },
            ],
          },
        },
      }),
    };
    expect(
      await githubEventHelpers.getIssueDueDateFromProject(
        app,
        'issueNodeId',
        octokit
      )
    ).toEqual('2023-06-23T18:00:00.000Z');
  });

  it('getIssueDetailsFromNodeId should return timestamp from project', async function () {
    const octokit = {
      graphql: jest.fn().mockReturnValue({
        node: { number: 1, repository: { name: 'test-repo' } },
      }),
    };
    expect(
      await githubEventHelpers.getIssueDetailsFromNodeId('issueNodeId', octokit)
    ).toEqual({ number: 1, repo: 'test-repo' });
  });
});
