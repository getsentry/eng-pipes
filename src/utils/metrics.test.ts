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

import { getLabelsTable } from '@/brain/issueNotifier';
import {
  WAITING_FOR_COMMUNITY_LABEL,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { db } from '@utils/db';

import { insertOss } from './metrics';

describe('metrics tests', function () {
  describe('insertOss', function () {
    const defaultPayload: Record<string, any> = {
      action: 'labeled',
      sender: {
        login: 'username',
        id: 'user_id',
      },
      repository: {
        full_name: 'test_repo',
        owner: {
          type: 'Organization',
        },
      },
      issue: {
        number: 1234,
        created_at: null,
        updated_at: null,
        labels: [{ name: 'Product Area: Test' }],
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
        .mockImplementation(() => 1487076708000);
      await db.migrate.latest();
      await getLabelsTable().insert({
        label_name: 'Product Area: Test',
        channel_id: 'CHNLIDRND1',
        offices: ['sfo'],
      });
      await getLabelsTable().insert({
        label_name: 'Product Area: Other',
        channel_id: 'CHNLIDRND1',
        offices: ['sfo'],
      });
    });

    afterAll(async () => {
      dateNowSpy.mockRestore();
      await db('label_to_channel').delete();
      await db.destroy();
    });

    it('should calculate triage by timestamp if labeled waiting for product owner', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = WAITING_FOR_PRODUCT_OWNER_LABEL;
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: '2017-02-16T01:00:00.000Z',
      });
    });

    it('should calculate route by timestamp if labeled waiting for support', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = WAITING_FOR_SUPPORT_LABEL;
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: '2017-02-15T01:00:00.000Z',
        timeToTriageBy: null,
      });
    });

    it('should not calculate timestamps if labeled waiting for product community', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = WAITING_FOR_COMMUNITY_LABEL;
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: null,
      });
    });

    it('should not calculate timestamps if unlabeled waiting for product community', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = WAITING_FOR_COMMUNITY_LABEL;
      testPayload.action = 'unlabeled';
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: null,
      });
    });

    it('should not calculate timestamps if unlabeled waiting for product owner', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = WAITING_FOR_PRODUCT_OWNER_LABEL;
      testPayload.action = 'unlabeled';
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: null,
      });
    });

    it('should not calculate timestamps if unlabeled waiting for support', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = WAITING_FOR_SUPPORT_LABEL;
      testPayload.action = 'unlabeled';
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: null,
      });
    });
  });
});
