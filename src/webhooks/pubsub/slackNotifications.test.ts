import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import {
  constructSlackMessage,
  getChannelsForIssue,
  getTriageSLOTimestamp,
  notifyProductOwnersForUntriagedIssues,
} from './slackNotifications';

import { bolt } from '~/src/api/slack';
import { GETSENTRY_ORG } from '~/src/config';
import { db } from '~/src/utils/db';

describe('Triage Notification Tests', function () {
  const org = GETSENTRY_ORG;
  beforeAll(async function () {
    await db.migrate.latest();
  });
  afterAll(async function () {
    await db('label_to_channel').delete();
    await db.destroy();
  });
  describe('getTriageSLOTimestamp', function () {
    let getIssueDueDateFromProjectSpy;
    beforeAll(function () {
      jest
        .spyOn(org, 'addIssueToGlobalIssuesProject')
        .mockReturnValue('issueNodeIdInProject');
      getIssueDueDateFromProjectSpy = jest.spyOn(
        org,
        'getIssueDueDateFromProject'
      );
    });
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('should return date populated in project field', async function () {
      org.api = {
        paginate: (a, b) => a(b),
        issues: { listComments: () => [] },
      };
      getIssueDueDateFromProjectSpy.mockReturnValue('2023-01-05T16:00:00.000Z');
      expect(
        await getTriageSLOTimestamp(org, 'test', 1234, 'issueNodeId')
      ).toEqual('2023-01-05T16:00:00.000Z');
    });
    it('should return current time if unable to parse random string in project field', async function () {
      org.api = {
        paginate: (a, b) => a(b),
        issues: { listComments: () => [] },
      };
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      getIssueDueDateFromProjectSpy.mockReturnValue('randomstring');
      expect(
        await getTriageSLOTimestamp(org, 'test', 1234, 'issueNodeId')
      ).not.toEqual('2023-01-05T16:00:00.000Z');
      expect(sentryCaptureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          'Could not parse timestamp from comments for test/issues/1234'
        )
      );
    });
    it('should return current time if unable to parse empty string in project field', async function () {
      org.api = {
        paginate: (a, b) => a(b),
        issues: { listComments: () => [] },
      };
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      getIssueDueDateFromProjectSpy.mockReturnValue('');
      expect(
        await getTriageSLOTimestamp(org, 'test', 1234, 'issueNodeId')
      ).not.toEqual('2023-01-05T16:00:00.000Z');
      expect(sentryCaptureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          'Could not parse timestamp from comments for test/issues/1234'
        )
      );
    });
  });
  describe('getChannelsForIssue', () => {
    it('will get channel info for repo without routing', () => {
      expect(
        getChannelsForIssue(
          'test-ttt-simple',
          'getsentry',
          '',
          moment('2022-12-12T17:00:00.000Z')
        )
      ).toEqual([{ channelId: 'C05A6BW303Z', isChannelInBusinessHours: true }]);
    });
    it('will get channel info for repo with routing', () => {
      expect(
        getChannelsForIssue(
          'routing-repo',
          'getsentry',
          'Multi-Team',
          moment('2022-12-14T00:00:00.000Z')
        )
      ).toEqual([
        {
          channelId: 'C05A6BW303Z',
          isChannelInBusinessHours: true,
        },
        {
          channelId: 'C05A6BW303B',
          isChannelInBusinessHours: false,
        },
      ]);
    });
    it('will return team-ospo channel if inputs are invalid', () => {
      expect(
        getChannelsForIssue(
          'garbage-repo',
          'getsentry',
          '',
          moment('2022-12-12T17:00:00.000Z')
        )
      ).toEqual([{ channelId: 'C05A6BW303Y', isChannelInBusinessHours: true }]);
    });
  });
  describe('constructSlackMessage', function () {
    let boltPostMessageSpy;
    beforeEach(function () {
      boltPostMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    });
    afterEach(async function () {
      await db('channel_last_notified').delete();
      jest.clearAllMocks();
    });
    it('should return empty promise if no issues are untriaged', async function () {
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T17:00:00.000Z');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(boltPostMessageSpy).toHaveBeenCalledTimes(0);
    });
    it('should return all issues in overdue if SLA has passed', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*',
                type: 'mrkdwn',
              },
              { text: '😰', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*',
                type: 'mrkdwn',
              },
              {
                text: '😰',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '1 hour 0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should sort issues before assigning ordinals to them', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*',
                type: 'mrkdwn',
              },
              {
                text: '😰',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '1 hour 0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should maintain independent and properly sorted ordinals for adjacent issue lists', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: 'Test Issue Overdue',
            triageBy: '2022-12-12T15:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue Almost Due',
            triageBy: '2022-12-12T19:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue Almost Due',
            triageBy: '2022-12-12T18:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/4',
            number: 4,
            title: 'Open Source Issue Overdue',
            triageBy: '2022-12-12T16:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*',
                type: 'mrkdwn',
              },
              { text: '😰', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/3|#3 Test Issue Overdue>',
                type: 'mrkdwn',
              },
              { text: '1 hour 58 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/4|#4 Open Source Issue Overdue>',
                type: 'mrkdwn',
              },
              { text: '58 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*',
                type: 'mrkdwn',
              },
              {
                text: '😨',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Open Source Issue Almost Due>',
                type: 'mrkdwn',
              },
              { text: '1 hour 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/1|#1 Test Issue Almost Due>',
                type: 'mrkdwn',
              },
              { text: '2 hours 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should strip issue of < and > characters in slack message', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: '<Test Issue 1>',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: '<Test Issue 2>',
            triageBy: '2022-12-12T22:00:00.000Z',
            createdAt: '2022-12-10T22:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: '<Test Issue 3>',
            triageBy: '2022-12-14T20:00:00.000Z',
            createdAt: '2022-12-12T20:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*',
                type: 'mrkdwn',
              },
              { text: '😰', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/1|#1 &lt;Test Issue 1&gt;>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*',
                type: 'mrkdwn',
              },
              { text: '😨', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 &lt;Test Issue 2&gt;>',
                type: 'mrkdwn',
              },
              { text: '1 hour 0 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should always notify if issues are overdue and an hour has passed', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(channelToIssuesMap, now.add(1, 'hours'))
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(4);
    });
    it('should return all issues in act fast if SLA is approaching', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T17:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*',
                type: 'mrkdwn',
              },
              {
                text: '😨',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '4 hours 0 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*',
                type: 'mrkdwn',
              },
              {
                text: '😨',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '3 hours 0 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '4 hours 0 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should always notify if issue SLA is in the act fast queue on every hour', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T17:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(channelToIssuesMap, now.add(1, 'hours'))
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(4);
    });
    it('should return nothing in triage queue if issues were created less than 4 hours ago', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-12T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-12T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-12T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });
    it('should return all issues in triage queue if SLA is more than 4 hours away', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '⏳ *Triage Queue*',
                type: 'mrkdwn',
              },
              { text: '😯', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '1 day left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '⏳ *Triage Queue*',
                type: 'mrkdwn',
              },
              {
                text: '😯',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '1 day left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '1 day left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should not notify if issues are only in triage queue and channel has been notified less than 4 hours ago', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(channelToIssuesMap, now.add(2, 'hours'))
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
    });
    it('should notify if issues are only in triage queue and channel has been notified 4 hours ago', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(channelToIssuesMap, now.add(4, 'hours'))
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(4);
    });
    it('should return issues appropriately in different blocks', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: 'Test Issue 2',
            triageBy: '2022-12-12T19:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel1', isChannelInBusinessHours: true },
            ],
          },
        ],
        channel2: [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-12T16:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: 'Test Issue 2',
            triageBy: '2022-12-12T19:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
            channels: [
              { channelId: 'channel2', isChannelInBusinessHours: true },
            ],
          },
        ],
      };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*',
                type: 'mrkdwn',
              },
              {
                text: '😨',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/3|#3 Test Issue 2>',
                type: 'mrkdwn',
              },
              { text: '2 hours 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*',
                type: 'mrkdwn',
              },
              { text: '😰', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '58 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*',
                type: 'mrkdwn',
              },
              {
                text: '😨',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/3|#3 Test Issue 2>',
                type: 'mrkdwn',
              },
              { text: '2 hours 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should return all issues in overdue if SLA has passed', async function () {
      const channelToIssuesMap = {
        channel1: [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            triageBy: '2022-12-09T20:00:00.000Z',
            createdAt: '2022-12-08T21:00:00.000Z',
            isChannelInBusinessHours: true,
            channelId: 'channel1',
          },
        ],
      };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(constructSlackMessage(channelToIssuesMap, now));
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            type: 'divider',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*',
                type: 'mrkdwn',
              },
              { text: '😰', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '3 days overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
    });
  });
  describe('notifyProductOwnersForUntriagedIssues', function () {
    const org = GETSENTRY_ORG;
    let getIssueDueDateFromProjectSpy, postMessageSpy;
    beforeAll(function () {
      jest
        .spyOn(org, 'addIssueToGlobalIssuesProject')
        .mockReturnValue('issueNodeIdInProject');
      getIssueDueDateFromProjectSpy = jest.spyOn(
        org,
        'getIssueDueDateFromProject'
      );
      postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    });
    beforeEach(function () {
      jest.clearAllMocks();
    });
    it('should report issues to slack from repos with routing and repos without routing', async function () {
      org.api.paginate = jest
        .fn()
        .mockReturnValueOnce([
          {
            html_url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue 1',
            node_id: 'node_id',
            labels: [
              { name: 'Waiting for: Product Owner' },
              { name: 'Product Area: Test' },
            ],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'routing-repo',
          },
          {
            html_url: 'https://test.com/issues/2',
            number: 2,
            title: 'Test Issue 2',
            node_id: 'node_id',
            labels: [
              { name: 'Waiting for: Product Owner' },
              { name: 'Product Area: Other' },
            ],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'routing-repo',
          },
        ])
        .mockReturnValueOnce([
          {
            html_url: 'https://test.com/issues/3',
            number: 3,
            title: 'Open Source Issue 1',
            node_id: 'node_id',
            labels: [{ name: 'Waiting for: Product Owner' }],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'test-ttt-simple',
          },
          {
            html_url: 'https://test.com/issues/4',
            number: 4,
            title: 'Open Source Issue 2',
            node_id: 'node_id',
            labels: [{ name: 'Waiting for: Product Owner' }],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'test-ttt-simple',
          },
        ])
        .mockReturnValue([]);
      getIssueDueDateFromProjectSpy
        .mockReturnValueOnce('2022-12-09T20:00:00.000Z')
        .mockReturnValueOnce('2022-12-12T13:00:00.000Z')
        .mockReturnValue('2022-12-12T21:00:00.000Z');
      const now = moment('2022-12-12T21:00:00.000Z');
      await notifyProductOwnersForUntriagedIssues(org, now);
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          { type: 'divider' },
          {
            fields: [
              { text: '🚨 *Overdue*', type: 'mrkdwn' },
              { text: '😰', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/1|#1 Test Issue 1>',
                type: 'mrkdwn',
              },
              { text: '3 days overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/3|#3 Open Source Issue 1>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '3. <https://test.com/issues/4|#4 Open Source Issue 2>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'C05A6BW303Z',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          { type: 'divider' },
          {
            fields: [
              { text: '🚨 *Overdue*', type: 'mrkdwn' },
              { text: '😰', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '1. <https://test.com/issues/2|#2 Test Issue 2>',
                type: 'mrkdwn',
              },
              { text: '8 hours overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'C05A6BW303Y',
        text: '👋 Triage Reminder ⏰',
      });
    });

    it('should not report issues for codecov repo', async function () {
      org.api.paginate = jest
        .fn()
        .mockReturnValueOnce([
          {
            html_url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue 1',
            node_id: 'node_id',
            labels: [
              { name: 'Waiting for: Product Owner' },
              { name: 'Product Area: Test' },
            ],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'routing-repo',
          },
          {
            html_url: 'https://test.com/issues/2',
            number: 2,
            title: 'Test Issue 2',
            node_id: 'node_id',
            labels: [
              { name: 'Waiting for: Product Owner' },
              { name: 'Product Area: Other' },
            ],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'routing-repo',
          },
        ])
        .mockReturnValueOnce([
          {
            html_url: 'https://test.com/issues/3',
            number: 3,
            title: 'Open Source Issue 1',
            node_id: 'node_id',
            labels: [{ name: 'Waiting for: Product Owner' }],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'test-ttt-simple',
          },
          {
            html_url: 'https://test.com/issues/4',
            number: 4,
            title: 'Open Source Issue 2',
            node_id: 'node_id',
            labels: [{ name: 'Waiting for: Product Owner' }],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'test-ttt-simple',
          },
        ])
        .mockReturnValue([]);
      getIssueDueDateFromProjectSpy
        .mockReturnValueOnce('2022-12-09T20:00:00.000Z')
        .mockReturnValueOnce('2022-12-12T13:00:00.000Z')
        .mockReturnValue('2022-12-12T21:00:00.000Z');
      const now = moment('2022-12-12T04:00:00.000Z');
      org.slug = 'codecov';
      await notifyProductOwnersForUntriagedIssues(org, now);
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });

    it('should not report issues when out of business hours', async function () {
      org.api.paginate = jest
        .fn()
        .mockReturnValueOnce([
          {
            html_url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue 1',
            node_id: 'node_id',
            labels: [
              { name: 'Waiting for: Product Owner' },
              { name: 'Product Area: Test' },
            ],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'routing-repo',
          },
          {
            html_url: 'https://test.com/issues/2',
            number: 2,
            title: 'Test Issue 2',
            node_id: 'node_id',
            labels: [
              { name: 'Waiting for: Product Owner' },
              { name: 'Product Area: Other' },
            ],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'routing-repo',
          },
        ])
        .mockReturnValueOnce([
          {
            html_url: 'https://test.com/issues/3',
            number: 3,
            title: 'Open Source Issue 1',
            node_id: 'node_id',
            labels: [{ name: 'Waiting for: Product Owner' }],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'test-ttt-simple',
          },
          {
            html_url: 'https://test.com/issues/4',
            number: 4,
            title: 'Open Source Issue 2',
            node_id: 'node_id',
            labels: [{ name: 'Waiting for: Product Owner' }],
            createdAt: '2022-12-08T21:00:00.000Z',
            repo: 'test-ttt-simple',
          },
        ])
        .mockReturnValue([]);
      getIssueDueDateFromProjectSpy
        .mockReturnValueOnce('2022-12-09T20:00:00.000Z')
        .mockReturnValueOnce('2022-12-12T13:00:00.000Z')
        .mockReturnValue('2022-12-12T21:00:00.000Z');
      const now = moment('2022-12-12T04:00:00.000Z');
      await notifyProductOwnersForUntriagedIssues(org, now);
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });
  });
});
