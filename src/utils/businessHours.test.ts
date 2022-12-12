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
  getBusinessHoursForTeam,
  getOfficesForTeam,
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
          testTimestamps[i].timestamp,
          'Team: Test'
        );
        expect(result).toEqual(triageResults[i]);
      });

      it(`should calculate TTR SLO violation for ${testTimestamps[i].day}`, async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          testTimestamps[i].timestamp,
          'Team: Test'
        );
        expect(result).toEqual(routingResults[i]);
      });
    }

    it('should handle case when offices is undefined', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        '2023-12-18T00:00:00.000Z',
        'Team: Undefined'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle case when offices is null', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_TRIAGE_DAYS,
        '2023-12-18T00:00:00.000Z',
        'Team: Null'
      );
      expect(result).toEqual('2023-12-20T01:00:00.000Z');
    });

    it('should handle the last day of the month for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        '2023-01-31T00:00:00.000Z',
        'Team: Test'
      );
      expect(result).toEqual('2023-02-01T01:00:00.000Z');
    });

    it('should handle the last day of the year for TTR', async function () {
      const result = await calculateTimeToRespondBy(
        MAX_ROUTE_DAYS,
        '2022-12-31T00:00:00.000Z',
        'Team: Test'
      );
      expect(result).toEqual('2023-01-04T01:00:00.000Z');
    });

    describe('holiday tests', function () {
      it('should calculate TTT SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          '2023-12-24T00:00:00.000Z',
          'Team: Test'
        );
        // 2023-12-24 is Sunday, 2023-12-25/2022-12-26 are holidays
        expect(result).toEqual('2023-12-29T01:00:00.000Z');
      });

      it('should calculate TTR SLO violation for Christmas', async function () {
        const result = await calculateTimeToRespondBy(
          MAX_ROUTE_DAYS,
          '2023-12-24T00:00:00.000Z',
          'Team: Test'
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
          '2023-10-02T00:00:00.000Z',
          'Team: Test'
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
          '2023-10-02T00:00:00.000Z',
          'Team: Test'
        );
        expect(result).toEqual('2023-10-03T00:00:00.000Z');
      });

      it('should route properly when team is subscribed to sfo, vie, and yyz', async function () {
        const command = {
          channel_id: 'CHNLIDRND2',
          text: 'Test yyz',
        };
        await slackHandler({ command, ack, say, respond, client });
        const result = await calculateTimeToRespondBy(
          MAX_TRIAGE_DAYS,
          '2023-10-02T17:00:00.000Z',
          'Team: Test'
        );
        expect(result).toEqual('2023-10-03T16:00:00.000Z');
        command.text = '-Test yyz';
        await slackHandler({ command, ack, say, respond, client });
        command.text = '-Test vie';
        await slackHandler({ command, ack, say, respond, client });
      });
    });
  });

  describe('calculateSLOViolationRoute', function () {
    it('should not calculate SLO violation if label is not unrouted', async function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = await calculateSLOViolationRoute(
        'Status: Test',
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is untriaged', async function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = await calculateSLOViolationRoute(
        UNTRIAGED_LABEL,
        timestamp
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is unrouted', async function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = await calculateSLOViolationRoute(
        UNROUTED_LABEL,
        timestamp
      );
      expect(result).toEqual('2022-11-15T23:36:00.000Z');
    });
  });

  describe('calculateSLOViolationTriage', function () {
    it('should not calculate SLO violation if label is not untriaged', async function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = await calculateSLOViolationTriage(
        'Status: Test',
        timestamp,
        [{ name: 'Team: Test' }]
      );
      expect(result).toEqual(null);
    });

    it('should not calculate SLO violation if label is unrouted', async function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = await calculateSLOViolationTriage(
        UNROUTED_LABEL,
        timestamp,
        [{ name: 'Team: Test' }]
      );
      expect(result).toEqual(null);
    });

    it('should calculate SLO violation if label is untriaged', async function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = await calculateSLOViolationTriage(
        UNTRIAGED_LABEL,
        timestamp,
        [{ name: 'Team: Test' }]
      );
      expect(result).toEqual('2022-11-16T23:36:00.000Z');
    });

    it('should calculate SLO violation if label is assigned to another team', async function () {
      const timestamp = '2022-11-14T23:36:00.000Z';
      const result = await calculateSLOViolationTriage(
        'Team: Rerouted',
        timestamp,
        [{ name: 'Status: Untriaged' }]
      );
      expect(result).toEqual('2022-11-16T23:36:00.000Z');
    });
  });

  describe('getBusinessHoursForTeam', function () {
    it('should get sfo timezones if team does not have offices', async function () {
      expect(
        await getBusinessHoursForTeam('Team: Does not exist', '2022-12-08')
      ).toEqual([
        {
          start: new Date('2022-12-08T17:00:00.000Z'),
          end: new Date('2022-12-09T01:00:00.000Z'),
        },
      ]);
    });

    it('should get sfo timezones for Team: Test', async function () {
      expect(await getBusinessHoursForTeam('Team: Test', '2022-12-08')).toEqual(
        [
          {
            start: new Date('2022-12-08T17:00:00.000Z'),
            end: new Date('2022-12-09T01:00:00.000Z'),
          },
        ]
      );
    });

    it('should get sfo, vie timezones for Team: Test', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getBusinessHoursForTeam('Team: Test', '2022-12-08')).toEqual(
        [
          {
            start: new Date('2022-12-08T08:00:00.000Z'),
            end: new Date('2022-12-08T16:00:00.000Z'),
          },
          {
            start: new Date('2022-12-08T17:00:00.000Z'),
            end: new Date('2022-12-09T01:00:00.000Z'),
          },
        ]
      );
    });

    it('should get sfo, vie, yyz timezones for Team: Test', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getBusinessHoursForTeam('Team: Test', '2022-12-08')).toEqual(
        [
          {
            start: new Date('2022-12-08T08:00:00.000Z'),
            end: new Date('2022-12-08T16:00:00.000Z'),
          },
          {
            start: new Date('2022-12-08T14:00:00.000Z'),
            end: new Date('2022-12-08T22:00:00.000Z'),
          },
          {
            start: new Date('2022-12-08T17:00:00.000Z'),
            end: new Date('2022-12-09T01:00:00.000Z'),
          },
        ]
      );
    });

    it('should return no hours for Christmas for vie, sfo, yyz', async function () {
      expect(await getBusinessHoursForTeam('Team: Test', '2023-12-25')).toEqual(
        []
      );
    });

    it('should return no hours for Saturday for vie, sfo, yyz', async function () {
      expect(await getBusinessHoursForTeam('Team: Test', '2022-12-17')).toEqual(
        []
      );
    });

    it('should return no hours for Sunday for vie, sfo, yyz', async function () {
      expect(await getBusinessHoursForTeam('Team: Test', '2022-12-18')).toEqual(
        []
      );
    });

    it('should get sfo only for Easter Monday', async function () {
      expect(await getBusinessHoursForTeam('Team: Test', '2023-04-10')).toEqual(
        [
          {
            start: new Date('2023-04-10T16:00:00.000Z'),
            end: new Date('2023-04-11T00:00:00.000Z'),
          },
        ]
      );
    });

    it('should get yyz, vie for Independence Day', async function () {
      expect(await getBusinessHoursForTeam('Team: Test', '2023-07-04')).toEqual(
        [
          {
            start: new Date('2023-07-04T07:00:00.000Z'),
            end: new Date('2023-07-04T15:00:00.000Z'),
          },
          {
            start: new Date('2023-07-04T13:00:00.000Z'),
            end: new Date('2023-07-04T21:00:00.000Z'),
          },
        ]
      );
      let command = {
        channel_id: 'CHNLIDRND2',
        text: '-Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      command = {
        channel_id: 'CHNLIDRND2',
        text: '-Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
    });
  });

  describe('getOfficesForTeam', function () {
    it('should return empty array if team label is undefined', async function () {
      expect(await getOfficesForTeam(undefined)).toEqual([]);
    });

    it('should return empty array if team offices value is undefined', async function () {
      expect(await getOfficesForTeam('Team: Undefined')).toEqual([]);
    });

    it('should return empty array if team offices value is null', async function () {
      expect(await getOfficesForTeam('Team: Null')).toEqual([]);
    });

    it('should get sfo office for team test', async function () {
      expect(await getOfficesForTeam('Team: Test')).toEqual(['sfo']);
    });

    it('should get sfo and vie office in sorted order for team test if new office is added', async function () {
      const command = {
        channel_id: 'CHNLIDRND1',
        text: 'Test vie',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOfficesForTeam('Team: Test')).toEqual(['vie', 'sfo']);
    });

    it('should get vie office in sorted order for team test if existing office is removed', async function () {
      const command = {
        channel_id: 'CHNLIDRND1',
        text: '-Test sfo',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOfficesForTeam('Team: Test')).toEqual(['vie']);
    });

    it('should get offices from multiple channels', async function () {
      const command = {
        channel_id: 'CHNLIDRND2',
        text: 'Test yyz',
      };
      await slackHandler({ command, ack, say, respond, client });
      expect(await getOfficesForTeam('Team: Test')).toEqual(['vie', 'yyz']);
    });
  });
});
