import { GH_ORGS } from '@/config';

import * as helpers from './helpers';

describe('helpers', function () {
  const org = GH_ORGS.get('__tmp_org_placeholder__');

  it('addIssueToGlobalIssuesProject should return project item id from project', async function () {
    const octokit = {
      graphql: jest
        .fn()
        .mockReturnValue({ addProjectV2ItemById: { item: { id: '12345' } } }),
    };
    expect(
      await helpers.addIssueToGlobalIssuesProject(
        org,
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
      await helpers.getAllProjectFieldNodeIds('projectFieldId', octokit)
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
      await helpers.getKeyValueFromProjectField(
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
                field: { id: org.project.response_due_date_field_id },
              },
            ],
          },
        },
      }),
    };
    expect(
      await helpers.getIssueDueDateFromProject(org, 'issueNodeId', octokit)
    ).toEqual('2023-06-23T18:00:00.000Z');
  });

  it('getIssueDetailsFromNodeId should return timestamp from project', async function () {
    const octokit = {
      graphql: jest.fn().mockReturnValue({
        node: { number: 1, repository: { name: 'test-repo' } },
      }),
    };
    expect(
      await helpers.getIssueDetailsFromNodeId('issueNodeId', octokit)
    ).toEqual({ number: 1, repo: 'test-repo' });
  });
});
