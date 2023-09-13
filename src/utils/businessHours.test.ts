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
  getOffices,
  isChannelInBusinessHours,
} from './businessHours';

describe('businessHours tests', function () {
  let say, respond, client, ack;
  beforeAll(async function () {
    await db.migrate.latest();
    await getLabelsTable().insert({
      label_name: 'Product Area: Test',
      channel_id: 'CHNLIDRND1',
      offices: ['sfo'],
    });
    await getLabelsTable().insert({
      label_name: 'Product Area: Undefined',
      channel_id: 'CHNLIDRND1',
      offices: undefined,
    });
    await getLabelsTable().insert({
      label_name: 'Product Area: Null',
      channel_id: 'CHNLIDRND1',
      offices: null,
    });
    await getLabelsTable().insert({
      label_name: 'Product Area: Other',
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
          'Product Area: Test',
          testTimestamps[i].timestamp
        );
        expect(result).toEqual(triageResults[i]);
      });

      it(`should calculate TTR SLO violation for ${testTimestamps[i].day}`, async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Product Area: Test',
          testTimestamps[i].timestamp
        );
        expect(result).toEqual(routingResults[i]);
      });
    }

    it('should handle case when offices is undefined', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        'Product Area: Undefined',
        '2023-12-18T00:00:00.000Z'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle case when offices is null', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        'Product Area: Null',
        '2023-12-18T00:00:00.000Z'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle the last day of the month for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        'Product Area: Test',
        '2023-01-31T00:00:00.000Z'
      );
      expect(result).toEqual('2023-02-01T00:00:00.000Z');
    });

    it('should handle the last day of the year for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        'Product Area: Test',
        '2022-12-31T00:00:00.000Z'
      );
      expect(result).toEqual('2023-01-04T01:00:00.000Z');
    });

    describe('holiday tests', function () {
      it('should calculate TTT SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Product Area: Test',
          '2023-12-24T00:00:00.000Z'
        );
        // 2023-12-24 is Sunday, 2023-12-25/2022-12-26 are holidays
        expect(result).toEqual('2024-01-04T01:00:00.000Z');
      });

      it('should calculate TTR SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Product Area: Test',
          '2023-12-24T00:00:00.000Z'
        );
        // 2023-12-24 is Sunday, 2023-12-25/2022-12-26 are holidays
        expect(result).toEqual('2024-01-03T01:00:00.000Z');
      });

      it('should not include holiday in TTR if at least one office is still open', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test yyz',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Product Area: Test',
          '2023-10-02T00:00:00.000Z'
        );
        expect(result).toEqual('2023-10-03T00:00:00.000Z');
        command.text = '-Test yyz';
        await slackHandler({ command, ack, say, respond, client });
      });

      it('should triage on the same day if two office timezones do not overlap', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test vie',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Product Area: Test',
          '2023-10-02T00:00:00.000Z'
        );
        expect(result).toEqual('2023-10-03T00:00:00.000Z');
      });

      it('should calculate weekends properly for friday in sfo, weekend in vie', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Product Area: Test',
          '2022-12-17T00:00:00.000Z'
        );
        expect(result).toEqual('2022-12-20T00:00:00.000Z');
      });

      it('should route properly when product area is subscribed to sfo, vie, and yyz', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test yyz',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Product Area: Test',
          '2022-12-20T15:30:00.000Z'
        );
        expect(result).toEqual('2022-12-20T23:30:00.000Z');
      });

      it('should triage properly when product area is subscribed to sfo, vie, and yyz', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test yyz',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Product Area: Test',
          '2022-12-20T15:30:00.000Z'
        );
        expect(result).toEqual('2022-12-21T14:30:00.000Z');
        command.text = '-Test yyz';
        await slackHandler({ command, ack, say, respond, client });
        command.text = '-Test vie';
        await slackHandler({ command, ack, say, respond, client });
      });
    });
  });

  describe('calculateSLOViolationRoute', function () {
    it('should not calculate SLO violation if label is routed', async function () {
      const result = await calculateSLOViolationRoute('Status: Test');
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is untriaged', async function () {
      const result = await calculateSLOViolationRoute(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is waiting for product owner', async function () {
      const result = await calculateSLOViolationRoute(
        WAITING_FOR_PRODUCT_OWNER_LABEL
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is unrouted', async function () {
      const result = await calculateSLOViolationRoute(
        WAITING_FOR_SUPPORT_LABEL
      );
      expect(result).not.toEqual(null);
    });
  });

  describe('isChannelInBusinessHours', function () {
    beforeAll(async function () {
      await getLabelsTable().insert({
        label_name: 'Product Area: Other',
        channel_id: 'CHNLIDRND4',
        offices: ['sfo', 'vie'],
      });
      await getLabelsTable().insert({
        label_name: 'Product Area: Test',
        channel_id: 'CHNLIDRND4',
        offices: ['yyz'],
      });
      await getLabelsTable().insert({
        label_name: 'Product Area: Undefined',
        channel_id: 'CHNLIDRND5',
        offices: undefined,
      });
    });
    afterAll(async function () {
      await getLabelsTable().where({ channel_id: 'CHNLIDRND4' }).del();
    });
    it('should return true for sfo office if in between 9am-5pm sfo business hours on workday', async function () {
      const nowForTest = moment('2023-01-05T18:00:00.000Z').utc();
      const result = await isChannelInBusinessHours('CHNLIDRND1', nowForTest);
      expect(result).toEqual(true);
    });

    it('should return true for sfo office if utc day is Saturday, but local sfo time is Friday', async function () {
      const nowForTest = moment('2023-02-04T01:00:00.000Z').utc();
      const result = await isChannelInBusinessHours('CHNLIDRND1', nowForTest);
      expect(result).toEqual(true);
    });

    it('should post message to OSPO channel if offices is undefined', async function () {
      const nowForTest = moment('2023-01-05T18:00:00.000Z').utc();
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      const result = await isChannelInBusinessHours('CHNLIDRND5', nowForTest);
      expect(postMessageSpy).toHaveBeenCalledWith({
        channel: 'G01F3FQ0T41',
        text: "Hey OSPO, looks like #test-channel doesn't have offices set.",
      });
      expect(result).toEqual(true);
    });

    it('should return true if no office specified and in between 9am-5pm sfo business hours on workday', async function () {
      const nowForTest = moment('2023-01-05T18:00:00.000Z').utc();
      const result = await isChannelInBusinessHours('CHNLIDRND3', nowForTest);
      expect(result).toEqual(true);
    });

    it('should return true for sfo office if on 9am sfo business hours on workday', async function () {
      const nowForTest = moment('2023-01-05T17:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND1', nowForTest);
      expect(result).toEqual(true);
    });

    it('should return true for sfo office if on 5pm sfo business hours on workday', async function () {
      const nowForTest = moment('2023-01-06T01:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND1', nowForTest);
      expect(result).toEqual(true);
    });

    it('should return false for sfo office if not in sfo business hours on workday', async function () {
      const nowForTest = moment('2023-01-05T09:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND1', nowForTest);
      expect(result).toEqual(false);
    });

    it('should return false for sfo office if it is Christmas during business hours', async function () {
      const nowForTest = moment('2023-12-24T17:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND1', nowForTest);
      expect(result).toEqual(false);
    });

    it('should return true if channel subscribed to vie, yyz, sfo and time is in sfo business hours', async function () {
      const nowForTest = moment('2023-01-06T01:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND4', nowForTest);
      expect(result).toEqual(true);
    });

    it('should return true if channel subscribed to vie, yyz, sfo and time is in yyz business hours', async function () {
      const nowForTest = moment('2023-01-06T16:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND4', nowForTest);
      expect(result).toEqual(true);
    });

    it('should return true if channel subscribed to vie, yyz, sfo and time is in vie business hours', async function () {
      const nowForTest = moment('2023-01-05T12:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND4', nowForTest);
      expect(result).toEqual(true);
    });

    it('should return false if channel subscribed to vie, yyz, sfo and time is a vie holiday', async function () {
      const nowForTest = moment('2023-01-06T12:00:00.000Z');
      const result = await isChannelInBusinessHours('CHNLIDRND4', nowForTest);
      expect(result).toEqual(false);
    });
  });

  describe('calculateSLOViolationTriage', function () {
    it('should not calculate SLO violation if label is not untriaged', async function () {
      const result = await calculateSLOViolationTriage('Status: Test', [
        { name: 'Product Area: Test' },
      ]);
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is unrouted', async function () {
      const result = await calculateSLOViolationTriage(
        WAITING_FOR_SUPPORT_LABEL,
        [{ name: 'Product Area: Test' }]
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is untriaged', async function () {
      const result = await calculateSLOViolationTriage(
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        [{ name: 'Product Area: Test' }]
      );
      expect(result).not.toEqual(null);
    });

    it('should calculate SLO violation if label is waiting for product owner', async function () {
      const result = await calculateSLOViolationTriage(
        WAITING_FOR_PRODUCT_OWNER_LABEL,
        [{ name: 'Product Area: Test' }]
      );
      expect(result).not.toEqual(null);
    });

    it('should calculate SLO violation if label is assigned to another product area for untriaged label', async function () {
      const result = await calculateSLOViolationTriage(
        'Product Area: Rerouted',
        [{ name: WAITING_FOR_PRODUCT_OWNER_LABEL }]
      );
      expect(result).not.toEqual(null);
    });

    it('should calculate SLO violation if label is assigned to another product area for waiting for product owner label', async function () {
      const result = await calculateSLOViolationTriage(
        'Product Area: Rerouted',
        [{ name: WAITING_FOR_PRODUCT_OWNER_LABEL }]
      );
      expect(result).not.toEqual(null);
    });
  });

  describe('getNextAvailableBusinessHourWindow', function () {
    it('should get open source product area timezones if product area does not have offices', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Product Area: Does not exist',
        moment('2022-12-08T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get sfo timezones for Product Area: Test', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Product Area: Test',
        moment('2022-12-08T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get vie timezone for Product Area: Test if it has the closest business hours available', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Product Area: Test',
        moment('2022-12-08T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T12:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-08T16:00:00.000Z').valueOf()
      );
    });

    it('should get sfo timezone for Product Area: Test if it has the closest business hours available', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Product Area: Test',
        moment('2022-12-08T16:30:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get yyz timezone for Product Area: Test if it has the closest business hours available', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Product Area: Test',
        moment('2022-12-08T16:30:00.000Z').utc()
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
        'Product Area: Test',
        moment('2023-12-23T12:00:00.000Z').utc()
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
        'Product Area: Test',
        moment('2022-12-17T12:00:00.000Z').utc()
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
        'Product Area: Test',
        moment('2022-12-18T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-19T08:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-19T16:00:00.000Z').valueOf()
      );
    });

    it('should return yyz hours for Saturday for product area subscribed to yyz, sfo', async function () {
      let command = {
        channel_id: 'CHNLIDRND2',
        text: '-Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Product Area: Test',
        moment('2022-12-17T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-19T14:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-19T22:00:00.000Z').valueOf()
      );
      command = {
        channel_id: 'CHNLIDRND2',
        text: '-Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
    });
  });

  describe('getOffices', function () {
    it('should return empty array if product area label is undefined', async function () {
      expect(await getOffices(undefined)).toEqual([]);
    });

    it('should return empty array if product area offices value is undefined', async function () {
      expect(await getOffices('Product Area: Undefined')).toEqual([]);
    });

    it('should return empty array if product area offices value is null', async function () {
      expect(await getOffices('Product Area: Null')).toEqual([]);
    });

    it('should get sfo office for product area test', async function () {
      expect(await getOffices('Product Area: Test')).toEqual(['sfo']);
    });

    it('should get sfo and vie office for product area test if new office is added', async function () {
      const command = {
        channel_id: 'CHNLIDRND1',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOffices('Product Area: Test')).toEqual(['sfo', 'vie']);
    });

    it('should get vie office for product area test if existing office is removed', async function () {
      const command = {
        channel_id: 'CHNLIDRND1',
        text: '-Test sfo',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOffices('Product Area: Test')).toEqual(['vie']);
    });

    it('should get offices from multiple channels', async function () {
      let command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOffices('Product Area: Test')).toEqual(['vie', 'yyz']);
      command = {
        channel_id: 'CHNLIDRND2',
        text: '-Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
    });
  });
});
