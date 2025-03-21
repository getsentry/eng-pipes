const mockInsert = jest.fn((data) => Promise.resolve(data));
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

import cloneDeep from 'lodash.clonedeep';
import moment from 'moment-timezone';

import {
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';

import { insertOss } from './metrics';

describe('metrics tests', function () {
  describe('insertOss', function () {
    describe('labeling events', function () {
      const defaultPayload: Record<string, any> = {
        action: 'labeled',
        sender: {
          login: 'username',
          id: 'user_id',
        },
        repository: {
          full_name: 'getsentry/routing-repo',
          name: 'routing-repo',
          owner: {
            type: 'Organization',
          },
        },
        organization: {
          login: 'getsentry',
        },
        issue: {
          number: 1234,
          created_at: null,
          updated_at: null,
          labels: [{ name: 'Product Area: Test' }],
          title: 'Test Issue',
        },
        label: {
          id: 1234,
          name: 'Status: Test',
        },
      };

      let dateNowSpy;
      beforeAll(async () => {
        dateNowSpy = jest
          .spyOn(Date, 'now')
          .mockReturnValue(moment('2017-02-14T12:51:48.000Z').valueOf());
      });

      afterAll(async () => {
        dateNowSpy.mockRestore();
      });

      it('should calculate triage by timestamp if labeled waiting for product owner', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.label.name = WAITING_FOR_PRODUCT_OWNER_LABEL;
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          timeToRouteBy: null,
          timeToTriageBy: '2017-02-16T01:00:00.000Z',
        });
      });

      it('should calculate triage by timestamp if labeled waiting for product owner for teams in vie', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.repository.full_name = 'getsentry/vie-repo';
        testPayload.repository.name = 'vie-repo';
        testPayload.label.name = WAITING_FOR_PRODUCT_OWNER_LABEL;
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          timeToRouteBy: null,
          timeToTriageBy: '2017-02-16T12:51:48.000Z',
        });
      });

      it('should calculate route by timestamp if labeled waiting for support', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.label.name = WAITING_FOR_SUPPORT_LABEL;
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          timeToRouteBy: '2017-02-15T01:00:00.000Z',
          timeToTriageBy: null,
        });
      });

      it('should not calculate timestamps if labeled waiting for product community', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.label.name = WAITING_FOR_COMMUNITY_LABEL;
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          timeToRouteBy: null,
          timeToTriageBy: null,
        });
      });

      it('should not calculate timestamps if unlabeled waiting for product community', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.label.name = WAITING_FOR_COMMUNITY_LABEL;
        testPayload.action = 'unlabeled';
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          timeToRouteBy: null,
          timeToTriageBy: null,
        });
      });

      it('should not calculate timestamps if unlabeled waiting for product owner', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.label.name = WAITING_FOR_PRODUCT_OWNER_LABEL;
        testPayload.action = 'unlabeled';
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          timeToRouteBy: null,
          timeToTriageBy: null,
        });
      });

      it('should not calculate timestamps if unlabeled waiting for support', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.label.name = WAITING_FOR_SUPPORT_LABEL;
        testPayload.action = 'unlabeled';
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          timeToRouteBy: null,
          timeToTriageBy: null,
        });
      });

      it('should include product area and team in github event payload when product area label is added', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.label.name = 'Product Area: One-Team';
        testPayload.action = 'labeled';
        testPayload.repository.name = 'routing-repo';
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          teams: ['team-dev-infra'],
          product_area: 'One-Team',
        });
      });

      it('should include product area and team in github event payload when product area exists in issue labels', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.issue.labels = [{ name: 'Product Area: One-Team' }];
        testPayload.action = 'labeled';
        testPayload.repository.name = 'routing-repo';
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          teams: ['team-dev-infra'],
          product_area: 'One-Team',
        });
      });

      it('should include team in github event payload when repo has a team mapping', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.action = 'labeled';
        testPayload.repository.name = 'test-ttt-simple';
        testPayload.issue.labels = [];
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          teams: ['team-issues'],
          product_area: null,
        });
      });

      it('should include team in github labeling event payload when repo has a team mapping', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.action = 'labeled';
        testPayload.repository.name = 'test-ttt-simple';
        testPayload.issue.labels = [];
        const result = await insertOss('issues', testPayload);
        expect(result).toMatchObject({
          teams: ['team-issues'],
          product_area: null,
        });
      });

      it('should include team in github issue_comment event payload when repo has a team mapping', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.repository.name = 'test-ttt-simple';
        testPayload.issue.labels = [];
        testPayload.comment = { id: 123, created_at: null, updated_at: null };
        const result = await insertOss('issue_comment', testPayload);
        expect(result).toMatchObject({
          teams: ['team-issues'],
          product_area: null,
          target_name: 'Test Issue',
        });
      });

      it('should include product area and team in github issue_comment event payload when given product area in routing repo', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.repository.name = 'routing-repo';
        testPayload.issue.labels = [{ name: 'Product Area: One-Team' }];
        testPayload.comment = { id: 123, created_at: null, updated_at: null };
        const result = await insertOss('issue_comment', testPayload);
        expect(result).toMatchObject({
          teams: ['team-dev-infra'],
          product_area: 'One-Team',
          target_name: 'Test Issue',
        });
      });
    });
    describe('comment events', function () {
      const defaultPayload = {
        action: 'created',
        issue: {
          number: 1,
          created_at: '2023-10-16T20:33:25Z',
          updated_at: '2023-10-16T20:33:25Z',
          title: 'Issue Title',
        },
        comment: {
          id: 1,
          created_at: '2023-10-17T00:00:00Z',
          updated_at: '2023-10-17T00:00:00Z',
        },
        sender: {
          login: 'username',
          id: 'user_id',
        },
        repository: {
          full_name: 'getsentry/routing-repo',
          name: 'routing-repo',
          owner: {
            type: 'Organization',
          },
        },
        organization: {
          login: 'getsentry',
        },
      };
      it('should insert issue comment info into bigquery', async function () {
        const testPayload = cloneDeep(defaultPayload);
        const result = await insertOss('issue_comment', testPayload);
        expect(result).toEqual({
          action: 'created',
          created_at: '2023-10-17T00:00:00Z',
          object_id: 1,
          product_area: null,
          repository: 'getsentry/routing-repo',
          target_id: 1,
          target_name: 'Issue Title',
          target_type: 'issue',
          teams: ['team-dev-infra'],
          timeToRouteBy: null,
          timeToTriageBy: null,
          type: 'issue_comment',
          updated_at: '2023-10-17T00:00:00Z',
          user_id: 'user_id',
          user_type: null,
          username: 'username',
        });
      });

      it('should insert pull request comment info into bigquery', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.issue.pull_request = {};
        testPayload.issue.title = 'Pull Request Title';
        const result = await insertOss('issue_comment', testPayload);
        expect(result).toEqual({
          action: 'created',
          created_at: '2023-10-17T00:00:00Z',
          object_id: 1,
          product_area: null,
          repository: 'getsentry/routing-repo',
          target_id: 1,
          target_name: 'Pull Request Title',
          target_type: 'pull_request',
          teams: ['team-dev-infra'],
          timeToRouteBy: null,
          timeToTriageBy: null,
          type: 'pull_request_comment',
          updated_at: '2023-10-17T00:00:00Z',
          user_id: 'user_id',
          user_type: null,
          username: 'username',
        });
      });
    });
    describe('discussion events', function () {
      const defaultPayload = {
        action: 'created',
        discussion: {
          number: 1,
          created_at: '2023-10-16T20:33:25Z',
          updated_at: '2023-10-16T20:33:25Z',
          title: 'Discussion Title',
        },
        sender: {
          login: 'username',
          id: 'user_id',
        },
        repository: {
          full_name: 'getsentry/routing-repo',
          name: 'routing-repo',
          owner: {
            type: 'Organization',
          },
        },
      };

      it('should insert discussion info into bigquery', async function () {
        const testPayload = cloneDeep(defaultPayload);
        const result = await insertOss('discussion', testPayload);
        expect(result).toEqual({
          action: 'created',
          created_at: '2023-10-16T20:33:25Z',
          object_id: 1,
          product_area: null,
          repository: 'getsentry/routing-repo',
          target_id: 1,
          target_name: 'Discussion Title',
          target_type: 'discussion',
          teams: [],
          timeToRouteBy: null,
          timeToTriageBy: null,
          type: 'discussion',
          updated_at: '2023-10-16T20:33:25Z',
          user_id: 'user_id',
          user_type: null,
          username: 'username',
        });
      });

      it('should insert discussion_comment info into bigquery', async function () {
        const testPayload = cloneDeep(defaultPayload);
        testPayload.comment = {
          created_at: '2023-10-17T00:00:00Z',
          updated_at: '2023-10-17T00:00:00Z',
          id: 1,
        };
        const result = await insertOss('discussion_comment', testPayload);
        expect(result).toEqual({
          action: 'created',
          created_at: '2023-10-17T00:00:00Z',
          object_id: 1,
          product_area: null,
          repository: 'getsentry/routing-repo',
          target_id: 1,
          target_name: 'Discussion Title',
          target_type: 'discussion',
          teams: [],
          timeToRouteBy: null,
          timeToTriageBy: null,
          type: 'discussion_comment',
          updated_at: '2023-10-17T00:00:00Z',
          user_id: 'user_id',
          user_type: null,
          username: 'username',
        });
      });
    });
  });
});
