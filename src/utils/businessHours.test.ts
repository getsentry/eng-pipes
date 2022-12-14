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
  UNROUTED_LABEL,
  UNTRIAGED_LABEL,
} from '@/config';
import { db } from '@utils/db';

import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
  calculateTimeToRespondBy,
  getNextAvailableBusinessHourWindow,
  getOffices,
} from './businessHours';

describe('businessHours tests', function () {
  let say, respond, client, ack;
  beforeAll(async function () {
    await db.migrate.latest();
    await getLabelsTable().insert({
      label_name: 'Team: Test',
      channel_id: 'CHNLIDRND1',
      offices: ['sfo'],
    });
    await getLabelsTable().insert({
      label_name: 'Team: Undefined',
      channel_id: 'CHNLIDRND1',
      offices: undefined,
    });
    await getLabelsTable().insert({
      label_name: 'Team: Null',
      channel_id: 'CHNLIDRND1',
      offices: null,
    });
    await getLabelsTable().insert({
      label_name: 'Team: Open Source',
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
          'Team: Test',
          testTimestamps[i].timestamp
        );
        expect(result).toEqual(triageResults[i]);
      });

      it(`should calculate TTR SLO violation for ${testTimestamps[i].day}`, async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Team: Test',
          testTimestamps[i].timestamp
        );
        expect(result).toEqual(routingResults[i]);
      });
    }

    it('should handle case when offices is undefined', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        'Team: Undefined',
        '2023-12-18T00:00:00.000Z'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle case when offices is null', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        'Team: Null',
        '2023-12-18T00:00:00.000Z'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle the last day of the month for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        'Team: Test',
        '2023-01-31T00:00:00.000Z'
      );
      expect(result).toEqual('2023-02-01T00:00:00.000Z');
    });

    it('should handle the last day of the year for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        'Team: Test',
        '2022-12-31T00:00:00.000Z'
      );
      expect(result).toEqual('2023-01-04T00:00:00.000Z');
    });

    describe('holiday tests', function () {
      it('should calculate TTT SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Team: Test',
          '2023-12-24T00:00:00.000Z'
        );
        // 2023-12-24 is Sunday, 2023-12-25/2022-12-26 are holidays
        expect(result).toEqual('2023-12-29T01:00:00.000Z');
      });

      it('should calculate TTR SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Team: Test',
          '2023-12-24T00:00:00.000Z'
        );
        // 2023-12-24 is Sunday, 2023-12-25/2022-12-26 are holidays
        expect(result).toEqual('2023-12-28T01:00:00.000Z');
      });

      it('should not include holiday in TTR if at least one office is still open', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test yyz',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Team: Test',
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
          'Team: Test',
          '2023-10-02T00:00:00.000Z'
        );
        expect(result).toEqual('2023-10-03T00:00:00.000Z');
      });

      it('should calculate weekends properly for friday in sfo, weekend in vie', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Team: Test',
          '2022-12-17T00:00:00.000Z'
        );
        expect(result).toEqual('2022-12-20T00:00:00.000Z');
      });

      it('should route properly when team is subscribed to sfo, vie, and yyz', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test yyz',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          'Team: Test',
          '2022-12-20T15:30:00.000Z'
        );
        expect(result).toEqual('2022-12-20T23:30:00.000Z');
      });

      it('should triage properly when team is subscribed to sfo, vie, and yyz', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test yyz',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          'Team: Test',
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
    it('should not calculate SLO violation if label is not unrouted', async function () {
      const result = await calculateSLOViolationRoute('Status: Test');
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is untriaged', async function () {
      const result = await calculateSLOViolationRoute(UNTRIAGED_LABEL);
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is unrouted', async function () {
      const result = await calculateSLOViolationRoute(UNROUTED_LABEL);
      expect(result).not.toEqual(null);
    });
  });

  describe('calculateSLOViolationTriage', function () {
    it('should not calculate SLO violation if label is not untriaged', async function () {
      const result = await calculateSLOViolationTriage('Status: Test', [
        { name: 'Team: Test' },
      ]);
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is unrouted', async function () {
      const result = await calculateSLOViolationTriage(UNROUTED_LABEL, [
        { name: 'Team: Test' },
      ]);
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is untriaged', async function () {
      const result = await calculateSLOViolationTriage(UNTRIAGED_LABEL, [
        { name: 'Team: Test' },
      ]);
      expect(result).not.toEqual(null);
    });

    it('should calculate SLO violation if label is assigned to another team', async function () {
      const result = await calculateSLOViolationTriage('Team: Rerouted', [
        { name: 'Status: Untriaged' },
      ]);
      expect(result).not.toEqual(null);
    });
  });

  describe('getNextAvailableBusinessHourWindow', function () {
    it('should get open source team timezones if team does not have offices', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Does not exist',
        moment('2022-12-08T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get sfo timezones for Team: Test', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
        moment('2022-12-08T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get vie timezone for Team: Test if it has the closest business hours available', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
        moment('2022-12-08T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T12:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-08T16:00:00.000Z').valueOf()
      );
    });

    it('should get sfo timezone for Team: Test if it has the closest business hours available', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
        moment('2022-12-08T16:30:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T17:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-09T01:00:00.000Z').valueOf()
      );
    });

    it('should get yyz timezone for Team: Test if it has the closest business hours available', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
        moment('2022-12-08T16:30:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-08T16:30:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-08T22:00:00.000Z').valueOf()
      );
    });

    it('should return vie hours for Christmas for team subscribed to vie, yyz, sfo', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
        moment('2023-12-23T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2023-12-27T08:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2023-12-27T16:00:00.000Z').valueOf()
      );
    });

    it('should return vie hours for Saturday for team subscribed to vie, yyz, sfo', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
        moment('2022-12-17T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-19T08:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-19T16:00:00.000Z').valueOf()
      );
    });

    it('should return vie hours for Sunday for team subscribed to vie, yyz, sfo', async function () {
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
        moment('2022-12-18T12:00:00.000Z').utc()
      );
      expect(start.valueOf()).toEqual(
        moment('2022-12-19T08:00:00.000Z').valueOf()
      );
      expect(end.valueOf()).toEqual(
        moment('2022-12-19T16:00:00.000Z').valueOf()
      );
    });

    it('should return yyz hours for Saturday for team subscribed to yyz, sfo', async function () {
      let command = {
        channel_id: 'CHNLIDRND2',
        text: '-Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      const { start, end } = await getNextAvailableBusinessHourWindow(
        'Team: Test',
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
    it('should return empty array if team label is undefined', async function () {
      expect(await getOffices(undefined)).toEqual([]);
    });

    it('should return empty array if team offices value is undefined', async function () {
      expect(await getOffices('Team: Undefined')).toEqual([]);
    });

    it('should return empty array if team offices value is null', async function () {
      expect(await getOffices('Team: Null')).toEqual([]);
    });

    it('should get sfo office for team test', async function () {
      expect(await getOffices('Team: Test')).toEqual(['sfo']);
    });

    it('should get sfo and vie office for team test if new office is added', async function () {
      const command = {
        channel_id: 'CHNLIDRND1',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOffices('Team: Test')).toEqual(['sfo', 'vie']);
    });

    it('should get vie office for team test if existing office is removed', async function () {
      const command = {
        channel_id: 'CHNLIDRND1',
        text: '-Test sfo',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOffices('Team: Test')).toEqual(['vie']);
    });

    it('should get offices from multiple channels', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOffices('Team: Test')).toEqual(['vie', 'yyz']);
    });
  });
});
