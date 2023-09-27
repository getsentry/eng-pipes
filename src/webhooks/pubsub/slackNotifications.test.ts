import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { getLabelsTable } from '@/brain/issueNotifier';
import { GETSENTRY_ORG } from '@/config';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import {
  constructSlackMessage,
  getChannelIdForIssue,
  getOfficesForRepo,
  getTriageSLOTimestamp,
  notifyProductOwnersForUntriagedIssues,
} from './slackNotifications';

describe('Triage Notification Tests', function () {
  const org = GETSENTRY_ORG;

  beforeAll(async function () {
    await db.migrate.latest();
    await getLabelsTable().insert({
      label_name: 'Product Area: Other',
      channel_id: 'channel1',
      offices: ['yyz'],
    });
    await getLabelsTable().insert({
      label_name: 'Product Area: Test',
      channel_id: 'channel2',
      offices: ['yyz'],
    });
    await getLabelsTable().insert({
      label_name: 'Product Area: Other',
      channel_id: 'channel2',
      offices: ['yyz'],
    });
  });
  afterAll(async function () {
    await db('label_to_channel').delete();
    await db.destroy();
  });
  describe('getTriageSLOTimestamp', function () {
    let getIssueDueDateFromProjectSpy;
    const sampleComment = {
      user: {
        type: 'Bot',
        login: 'getsantry[bot]',
      },
      body: `Routing to @getsentry/open-source for [triage](https://develop.sentry.dev/processing-tickets/
        #3-triage), due by **<time datetime=2023-01-05T16:00:00.000Z>Thu Jan 05 2023 16:00:00 GMT+0000</time>**.`,
      created_at: '2022-12-27T21:14:14Z',
    };
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
  describe('getChannelIdForIssue', () => {
    it('will get channelId for valid repo and org', () => {
      expect(getChannelIdForIssue('test-ttt-simple', 'getsentry')).toEqual(
        'C05A6BW303Y'
      );
    });
    it('will return null if inputs are invalid', () => {
      expect(getChannelIdForIssue('garbage-repo', 'getsentry')).toEqual(null);
    });
  });
  describe('getOfficesForRepo', () => {
    it('will get channelId for valid repo and org', () => {
      expect(getOfficesForRepo('test-ttt-simple', 'getsentry')).toEqual([
        'sea',
      ]);
    });
    it('will return null if inputs are invalid', () => {
      expect(getOfficesForRepo('garbage-repo', 'getsentry')).toEqual([]);
    });
    it('will return sfo if office for repo is null', () => {
      expect(getOfficesForRepo('test-null', 'getsentry')).toEqual(['sfo']);
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
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [],
        'Product Area: Other': [],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T17:00:00.000Z');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
      expect(boltPostMessageSpy).toHaveBeenCalledTimes(0);
    });
    it('should return empty promise if outside business hours', async function () {
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T00:00:00.000Z');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
      expect(boltPostMessageSpy).toHaveBeenCalledTimes(0);
    });
    it('should return all issues in overdue if SLA has passed', async function () {
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      const notificationChannels = {
        channel1: ['Product Area: Test', 'Product Area: Other'],
      };

      // Note that these issues come in in reverse order.
      const productAreaToIssuesMap = {
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      const notificationChannels = {
        channel1: ['Product Area: Test', 'Product Area: Other'],
      };

      // Note that the orders of the two lists are flipped relative to one another: one is
      // ascending, the other is descending. This let's us validate that the final ordinal
      // assignment is done independent of the ordering of the array we receive.
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: 'Test Issue Overdue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T15:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue Almost Due',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T19:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue Almost Due',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T18:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
          {
            url: 'https://test.com/issues/4',
            number: 4,
            title: 'Open Source Issue Overdue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T16:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      const notificationChannels = {
        channel1: ['Product Area: Test'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: '<Test Issue 1>',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: '<Test Issue 2>',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T22:00:00.000Z',
            createdAt: '2022-12-10T22:00:00.000Z',
          },
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: '<Test Issue 3>',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-14T20:00:00.000Z',
            createdAt: '2022-12-12T20:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now.add(1, 'hours')
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(4);
    });
    it('should return all issues in act fast if SLA is approaching', async function () {
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T17:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T17:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now.add(1, 'hours')
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(4);
    });
    it('should return nothing in triage queue if issues were created less than 4 hours ago', async function () {
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-12T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-12T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });
    it('should return all issues in triage queue if SLA is more than 4 hours away', async function () {
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now.add(2, 'hours')
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
    });
    it('should notify if issues are only in triage queue and channel has been notified 4 hours ago', async function () {
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-13T20:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now.add(4, 'hours')
        )
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(4);
    });
    it('should return issues appropriately in different blocks', async function () {
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-13T21:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: 'Test Issue 2',
            productAreaLabel: 'Product Area: Test',
            triageBy: '2022-12-12T19:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
        'Product Area: Other': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            productAreaLabel: 'Product Area: Other',
            triageBy: '2022-12-12T16:00:00.000Z',
            createdAt: '2022-12-10T21:00:00.000Z',
          },
        ],
      };
      const channelToIssuesMap = { channel1: [], channel2: [] };
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      const notificationChannels = {
        channel1: ['Product Area: Test'],
        channel2: ['Product Area: Test', 'Product Area: Other'],
      };
      const productAreaToIssuesMap = {
        'Product Area: Test': [],
        'Product Area: Other': [],
      };
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
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
          channelToIssuesMap,
          now
        )
      );
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
      expect(postMessageSpy).toHaveBeenCalledTimes(3);
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
                text: '2. <https://test.com/issues/2|#2 Test Issue 2>',
                type: 'mrkdwn',
              },
              { text: '8 hours overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
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
                text: '1. <https://test.com/issues/3|#3 Open Source Issue 1>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '2. <https://test.com/issues/4|#4 Open Source Issue 2>',
                type: 'mrkdwn',
              },
              { text: '0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'C05A6BW303Y',
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
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
    });

    it('should not report issues to slack from codecov repos', async function () {
      org.api.paginate = jest
        .fn()
        .mockReturnValueOnce([])
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
            repo: 'test-ttt-simple',
          },
        ])
        .mockReturnValue([]);
      org.slug = 'codecov';
      getIssueDueDateFromProjectSpy.mockReturnValue('2022-12-12T21:00:00.000Z');
      const now = moment('2022-12-12T21:00:00.000Z');
      await notifyProductOwnersForUntriagedIssues(org, now);
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });
  });
});
