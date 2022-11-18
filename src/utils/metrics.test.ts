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
    const testTimestamps = [
      { day: 'Monday', timestamp: '2022-11-14T23:36:00.000Z' },
      { day: 'Tuesday', timestamp: '2022-11-15T23:36:00.000Z' },
      { day: 'Wednesday', timestamp: '2022-11-16T23:36:00.000Z' },
      { day: 'Thursday', timestamp: '2022-11-17T23:36:00.000Z' },
      { day: 'Friday', timestamp: '2022-11-18T23:36:00.000Z' },
      { day: 'Saturday', timestamp: '2022-11-19T23:36:00.000Z' },
      { day: 'Sunday', timestamp: '2022-11-20T23:36:00.000Z' },
    ];

    const triageResults = [
      '2022-11-16T23:36:00.000Z',
      '2022-11-17T23:36:00.000Z',
      '2022-11-18T23:36:00.000Z',
      '2022-11-21T23:36:00.000Z',
      '2022-11-22T23:36:00.000Z',
      '2022-11-22T23:36:00.000Z',
      '2022-11-22T23:36:00.000Z',
    ];

    const routingResults = [
      '2022-11-15T23:36:00.000Z',
      '2022-11-16T23:36:00.000Z',
      '2022-11-17T23:36:00.000Z',
      '2022-11-18T23:36:00.000Z',
      '2022-11-21T23:36:00.000Z',
      '2022-11-21T23:36:00.000Z',
      '2022-11-21T23:36:00.000Z',
    ];

    for (let i = 0; i < 7; i++) {
      it(`should calculate TTT SLO violation for ${testTimestamps[i].day}`, function () {
        const result = calcDate(MAX_TRIAGE_DAYS, testTimestamps[i].timestamp);
        expect(result).toEqual(triageResults[i]);
      });

      it(`should calculate TTR SLO violation for ${testTimestamps[i].day}`, function () {
        const result = calcDate(MAX_ROUTE_DAYS, testTimestamps[i].timestamp);
        expect(result).toEqual(routingResults[i]);
      });
    }
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
