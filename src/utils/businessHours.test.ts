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

import moment from 'moment-timezone';

import { getLabelsTable, slackHandler } from '@/brain/issueNotifier';
import {
  GETSENTRY_ORG,
  MAX_ROUTE_DAYS,
  MAX_TRIAGE_DAYS,
  WAITING_FOR_PRODUCT_OWNER_LABEL,
  WAITING_FOR_SUPPORT_LABEL,
} from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
  calculateTimeToRespondBy,
  getNextAvailableBusinessHourWindow,
} from './businessHours';
import * as businessHourfunctions from './businessHours';

describe('businessHours tests', function () {
  let say, respond, client, ack;
  beforeAll(async function () {
    await db.migrate.latest();
    await getLabelsTable().insert({
      label_name: 'Test',
      channel_id: 'CHNLIDRND1',
      offices: ['sfo'],
    });
    await getLabelsTable().insert({
      label_name: 'Undefined',
      channel_id: 'CHNLIDRND1',
      offices: undefined,
    });
    await getLabelsTable().insert({
      label_name: 'Null',
      channel_id: 'CHNLIDRND1',
      offices: null,
    });
    await getLabelsTable().insert({
      label_name: 'Other',
      channel_id: 'CHNLIDRND1',
      offices: ['sfo'],
    });
    say = jest.fn();
    respond = jest.fn();
    client = {
      conversations: {
        info: jest
          .fn()
          .mockReturnValue({ channel: { name: 'test', is_member: true } }),
        join: jest.fn(),
      },
    };
    ack = jest.fn();
  });
  afterAll(async function () {
    await db('label_to_channel').delete();
    await db.destroy();
  });
  describe('calculateTimeToRespondBy', function () {
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
      '2022-11-23T01:00:00.000Z',
      '2022-11-23T01:00:00.000Z',
    ];

    const routingResults = [
      '2022-11-15T23:36:00.000Z',
      '2022-11-16T23:36:00.000Z',
      '2022-11-17T23:36:00.000Z',
      '2022-11-18T23:36:00.000Z',
      '2022-11-21T23:36:00.000Z',
      '2022-11-22T01:00:00.000Z',
      '2022-11-22T01:00:00.000Z',
    ];

    for (let i = 0; i < 7; i++) {
      it(`should calculate TTT SLO violation for ${testTimestamps[i].day}`, async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Test',
          'routing-repo',
          GETSENTRY_ORG.slug,
          testTimestamps[i].timestamp
        );
        expect(result).toEqual(triageResults[i]);
      });

      it(`should calculate TTR SLO violation for ${testTimestamps[i].day}`, async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Test',
          'routing-repo',
          GETSENTRY_ORG.slug,
          testTimestamps[i].timestamp
        );
        expect(result).toEqual(routingResults[i]);
      });
    }

    it('should handle case when offices is undefined', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        'Undefined',
        'routing-repo',
        GETSENTRY_ORG.slug,
        '2023-12-18T00:00:00.000Z'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle case when offices is null', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        'Null',
        'routing-repo',
        GETSENTRY_ORG.slug,
        '2023-12-18T00:00:00.000Z'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle the last day of the month for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        'Test',
        'routing-repo',
        GETSENTRY_ORG.slug,
        '2023-01-31T00:00:00.000Z'
      );
      expect(result).toEqual('2023-02-01T00:00:00.000Z');
    });

    it('should handle the last day of the year for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        'Test',
        'routing-repo',
        GETSENTRY_ORG.slug,
        '2022-12-31T00:00:00.000Z'
      );
      expect(result).toEqual('2023-01-04T01:00:00.000Z');
    });

    describe('holiday tests', function () {
      it('should calculate TTT SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Test',
          'routing-repo',
          GETSENTRY_ORG.slug,
          '2023-12-24T00:00:00.000Z'
        );
        // 2023-12-24 is Sunday, 2023-12-25/2022-12-26 are holidays
        expect(result).toEqual('2024-01-04T01:00:00.000Z');
      });

      it('should calculate TTR SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Test',
          'routing-repo',
          GETSENTRY_ORG.slug,
          '2023-12-24T00:00:00.000Z'
        );
        // 2023-12-24 is Sunday, 2023-12-25/2022-12-26 are holidays
        expect(result).toEqual('2024-01-03T01:00:00.000Z');
      });

      it('should not include holiday in TTR if at least one office is still open', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Test',
          'routing-repo',
          GETSENTRY_ORG.slug,
          '2023-10-02T00:00:00.000Z'
        );
        expect(result).toEqual('2023-10-03T00:00:00.000Z');
      });

      it('should triage on the same day if two office timezones do not overlap', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Non-Overlapping Timezone',
          'routing-repo',
          GETSENTRY_ORG.slug,
          '2023-10-02T00:00:00.000Z'
        );
        expect(result).toEqual('2023-10-03T00:00:00.000Z');
      });

      it('should calculate weekends properly for friday in sfo, weekend in vie', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Non-Overlapping Timezone',
          'routing-repo',
          GETSENTRY_ORG.slug,
          '2022-12-17T00:00:00.000Z'
        );
        expect(result).toEqual('2022-12-20T00:00:00.000Z');
      });

      it('should route properly when product area is subscribed to sfo, vie, and yyz', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'All-Timezones',
          'routing-repo',
          GETSENTRY_ORG.slug,
          '2022-12-20T15:30:00.000Z'
        );
        expect(result).toEqual('2022-12-20T23:30:00.000Z');
      });

      it('should triage properly when product area is subscribed to sfo, vie, and yyz', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'All-Timezones',
          'routing-repo',
          GETSENTRY_ORG.slug,
          '2022-12-20T15:30:00.000Z'
        );
        expect(result).toEqual('2022-12-21T14:30:00.000Z');
      });
    });
  });

  describe('calculateSLOViolationRoute', function () {
    it('should not calculate SLO violation if label is routed', async function () {
      const result = await calculateSLOViolationRoute(
        'Status: Test',
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is untriaged', async function () {
      const result = await calculateSLOViolationRoute(
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is waiting for product owner', async function () {
      const result = await calculateSLOViolationRoute(
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is unrouted', async function () {
      const result = await calculateSLOViolationRoute(
        WAITING_FOR_SUPPORT_LABEL,
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).not.toEqual(null);
    });
  });

  describe('calculateSLOViolationTriage', function () {
    it('should not calculate SLO violation if label is not untriaged', async function () {
      const result = await calculateSLOViolationTriage(
        'Status: Test',
        [{ name: 'Product Area: Test' }],
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is unrouted', async function () {
      const result = await calculateSLOViolationTriage(
        WAITING_FOR_SUPPORT_LABEL,
        [{ name: 'Product Area: Test' }],
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is untriaged', async function () {
      const result = await calculateSLOViolationTriage(
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        [{ name: 'Product Area: Test' }],
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).not.toEqual(null);
    });

    it('should calculate SLO violation if label is waiting for product owner', async function () {
      const result = await calculateSLOViolationTriage(
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        [{ name: 'Product Area: Test' }],
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(result).not.toEqual(null);
    });
  });

  describe('getNextAvailableBusinessHourWindow', function () {
    it('should get open source product area timezones if product area does not have offices', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Does not exist',
        moment('2022-12-08T12:00:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get sfo timezones for repo with no offices defined', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        '',
        moment('2022-12-08T12:00:00.000Z').utc(),
        'test-null',
        'getsentry'
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get sfo timezones for Test', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Test',
        moment('2022-12-08T12:00:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get vie timezone for Test if it has the closest business hours available', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Non-Overlapping Timezone',
        moment('2022-12-08T12:00:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T12:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-08T16:00:00.000Z').valueOf()
      );
    });

    it('should get sfo timezone for Test if it has the closest business hours available', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Non-Overlapping Timezone',
        moment('2022-12-08T16:30:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get yyz timezone for Test if it has the closest business hours available', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'All-Timezones',
        moment('2022-12-08T16:30:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T16:30:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-08T22:00:00.000Z').valueOf()
      );
    });

    it('should return vie hours for Christmas for product area subscribed to vie, yyz, sfo', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'All-Timezones',
        moment('2023-12-23T12:00:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2024-01-02T08:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2024-01-02T16:00:00.000Z').valueOf()
      );
    });

    it('should return vie hours for Saturday for product area subscribed to vie, yyz, sfo', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'All-Timezones',
        moment('2022-12-17T12:00:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-19T08:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-19T16:00:00.000Z').valueOf()
      );
    });

    it('should return vie hours for Sunday for product area subscribed to vie, yyz, sfo', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'All-Timezones',
        moment('2022-12-18T12:00:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-19T08:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-19T16:00:00.000Z').valueOf()
      );
    });

    it('should return yyz hours for Saturday for product area subscribed to yyz, sfo', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Overlapping Timezone',
        moment('2022-12-17T12:00:00.000Z').utc(),
        'routing-repo',
        GETSENTRY_ORG.slug
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-19T14:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-19T22:00:00.000Z').valueOf()
      );
    });
  });
});
