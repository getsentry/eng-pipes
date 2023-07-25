import { GETSENTRY_ORG } from '@/config';

import * as helpers from './helpers';

describe('helpers', function () {
  const org = GETSENTRY_ORG;

  it('addIssueToGlobalIssuesProject should return project item id from project', async function () {
    org.api = {
      graphql: jest
        .fn()
        .mockReturnValue({ addProjectV2ItemById: { item: { id: '12345' } } }),
    };
    expect(
      await helpers.addIssueToGlobalIssuesProject(
        org,
        'issueNodeId',
        'test-repo',
        1
      )
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
    expect(
      await helpers.getAllProjectFieldNodeIds(org, 'projectFieldId')
    ).toEqual({
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
      await helpers.getKeyValueFromProjectField(org, 'issueNodeId', 'fieldName')
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
    expect(
      await helpers.getIssueDueDateFromProject(org, 'issueNodeId')
    ).toEqual('2023-06-23T18:00:00.000Z');
  });

  it('getIssueDetailsFromNodeId should return issue details', async function () {
    org.api = {
      graphql: jest.fn().mockReturnValue({
        node: { number: 1, repository: { name: 'test-repo' } },
      }),
    };
    expect(await helpers.getIssueDetailsFromNodeId(org, 'issueNodeId')).toEqual(
      { number: 1, repo: 'test-repo' }
    );
  });
});
