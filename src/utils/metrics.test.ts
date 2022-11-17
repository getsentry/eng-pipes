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

import {
  MAX_ROUTE_DAYS,
  MAX_TRIAGE_DAYS,
  UNROUTED_LABEL,
  UNTRIAGED_LABEL,
} from '@/config';

import {
  calcDate,
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
  insertOss,
} from './metrics';

describe('metrics tests', function () {
  describe('calcDate', function () {
    it('should calculate SLO violation for Monday', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(1);
      const result = calcDate(MAX_TRIAGE_DAYS, timestamp);
      expect(result).toEqual('2022-11-16T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(3);
    });

    it('should calculate SLO violation for Tuesday', function () {
      const timestamp = '2022-11-15T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(2);
      const result = calcDate(MAX_TRIAGE_DAYS, timestamp);
      expect(result).toEqual('2022-11-17T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(4);
    });

    it('should calculate SLO violation for Wednesday', function () {
      const timestamp = '2022-11-16T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(3);
      const result = calcDate(MAX_TRIAGE_DAYS, timestamp);
      expect(result).toEqual('2022-11-18T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(5);
    });

    it('should calculate SLO violation for Thursday', function () {
      // This is a Thursday
      const timestamp = '2022-11-17T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(4);
      const result = calcDate(MAX_TRIAGE_DAYS, timestamp);
      expect(result).toEqual('2022-11-21T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(1);
    });

    it('should calculate SLO violation for Friday', function () {
      const timestamp = '2022-11-18T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(5);
      const result = calcDate(MAX_TRIAGE_DAYS, timestamp);
      expect(result).toEqual('2022-11-22T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(2);
    });

    it('should calculate SLO violation for Saturday', function () {
      const timestamp = '2022-11-19T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(6);
      const result = calcDate(MAX_TRIAGE_DAYS, timestamp);
      expect(result).toEqual('2022-11-22T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(2);
    });

    it('should calculate SLO violation for Sunday', function () {
      const timestamp = '2022-11-20T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(0);
      const result = calcDate(MAX_TRIAGE_DAYS, timestamp);
      expect(result).toEqual('2022-11-22T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(2);
    });

    it('should calculate SLO violation for Monday', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(1);
      const result = calcDate(MAX_ROUTE_DAYS, timestamp);
      expect(result).toEqual('2022-11-15T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(2);
    });

    it('should calculate SLO violation for Tuesday', function () {
      const timestamp = '2022-11-15T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(2);
      const result = calcDate(MAX_ROUTE_DAYS, timestamp);
      expect(result).toEqual('2022-11-16T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(3);
    });

    it('should calculate SLO violation for Wednesday', function () {
      const timestamp = '2022-11-16T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(3);
      const result = calcDate(MAX_ROUTE_DAYS, timestamp);
      expect(result).toEqual('2022-11-17T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(4);
    });

    it('should calculate SLO violation for Thursday', function () {
      const timestamp = '2022-11-17T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(4);
      const result = calcDate(MAX_ROUTE_DAYS, timestamp);
      expect(result).toEqual('2022-11-18T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(5);
    });

    it('should calculate SLO violation for Friday', function () {
      const timestamp = '2022-11-18T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(5);
      const result = calcDate(MAX_ROUTE_DAYS, timestamp);
      expect(result).toEqual('2022-11-21T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(1);
    });

    it('should calculate SLO violation for Saturday', function () {
      const timestamp = '2022-11-19T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(6);
      const result = calcDate(MAX_ROUTE_DAYS, timestamp);
      expect(result).toEqual('2022-11-21T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(1);
    });

    it('should calculate SLO violation for Sunday', function () {
      const timestamp = '2022-11-20T23:36:00.000Z';
      expect(new Date(timestamp).getDay()).toEqual(0);
      const result = calcDate(MAX_ROUTE_DAYS, timestamp);
      expect(result).toEqual('2022-11-21T23:36:00.000Z');
      expect(new Date(result).getDay()).toEqual(1);
    });
  });

  describe('calculateSLOViolationRoute', function () {
    it('should not calculate SLO violation if label is not unrouted', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationRoute(
        'Status: Test',
        'labeled',
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is untriaged', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationRoute(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is unrouted', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationRoute(
        UNROUTED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-15T23:36:00.000Z');
    });
  });

  describe('calculateSLOViolationTriage', function () {
    it('should not calculate SLO violation if label is not untriaged', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationTriage(
        'Status: Test',
        'labeled',
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is unrouted', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationTriage(
        UNROUTED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is untriaged', function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        'labeled',
        timestamp
      );
      expect(result).toEqual('2022-11-16T23:36:00.000Z');
    });
  });

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
      },
      label: {
        id: 1234,
        name: 'Status: Test',
      },
    };

    let dateNowSpy;
    beforeAll(() => {
      dateNowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => 1487076708000);
    });

    afterAll(() => {
      dateNowSpy.mockRestore();
    });

    it('should calculate triage by timestamp if labeled untriaged status', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = UNTRIAGED_LABEL;
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: '2017-02-16T12:51:48.000Z',
      });
    });

    it('should calculate route by timestamp if labeled unrouted status', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = UNROUTED_LABEL;
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: '2017-02-15T12:51:48.000Z',
        timeToTriageBy: null,
      });
    });

    it('should not calculate route by timestamp if unlabeled untriaged status', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = UNTRIAGED_LABEL;
      testPayload.action = 'unlabeled';
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: null,
      });
    });

    it('should not calculate route by timestamp if unlabeled unrouted status', async function () {
      const testPayload = defaultPayload;
      testPayload.label.name = UNROUTED_LABEL;
      testPayload.action = 'unlabeled';
      const result = await insertOss('issues', testPayload);
      expect(result).toMatchObject({
        timeToRouteBy: null,
        timeToTriageBy: null,
      });
    });
  });
});
