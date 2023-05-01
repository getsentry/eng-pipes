import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { getLabelsTable } from '@/brain/issueNotifier';
import { bolt } from '@api/slack';
import { db } from '@utils/db';

import { constructSlackMessage, getTriageSLOTimestamp } from '.';

describe('Triage Notification Tests', function () {
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
    const sampleComment = {
      user: {
        type: 'Bot',
        login: 'getsantry[bot]',
      },
      body: `Routing to @getsentry/open-source for [triage](https://develop.sentry.dev/processing-tickets/
        #3-triage), due by **<time datetime=2023-01-05T16:00:00.000Z>Thu Jan 05 2023 16:00:00 GMT+0000</time>**.`,
      created_at: '2022-12-27T21:14:14Z',
    };
    it('should get the timestamp from bot comment for triaging', async function () {
      const octokit = {
        paginate: (a, b) => a(b),
        issues: { listComments: () => [sampleComment] },
      };
      expect(await getTriageSLOTimestamp(octokit, 'test', 1234)).toEqual(
        '2023-01-05T16:00:00.000Z'
      );
    });
    it('should ignore comments not from bot', async function () {
      const octokit = {
        paginate: (a, b) => a(b),
        issues: {
          listComments: () => [
            sampleComment,
            {
              user: {
                type: 'User',
              },
              body: `Routing to @getsentry/test for [triage](https://develop.sentry.dev/processing-tickets/
            #3-triage), due by **<time datetime=2023-01-06T16:00:00.000Z>Thu Jan 05 2023 16:00:00 GMT+0000</time>**.`,
              created_at: '2022-12-28T21:14:14Z',
            },
          ],
        },
      };
      expect(await getTriageSLOTimestamp(octokit, 'test', 1234)).toEqual(
        '2023-01-05T16:00:00.000Z'
      );
    });
    it('should return current time if unable to parse timestamp', async function () {
      const octokit = {
        paginate: (a, b) => a(b),
        issues: {
          listComments: () => [
            {
              user: {
                type: 'Bot',
                login: 'getsantry[bot]',
              },
              body: `random string`,
              created_at: '2022-12-28T21:14:14Z',
            },
          ],
        },
      };
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      expect(await getTriageSLOTimestamp(octokit, 'test', 1234)).not.toEqual(
        '2023-01-05T16:00:00.000Z'
      );
      expect(sentryCaptureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          'Could not parse timestamp from comments for test/issues/1234'
        )
      );
    });
    it('should return current time if bot comment is not found', async function () {
      const octokit = {
        paginate: (a, b) => a(b),
        issues: {
          listComments: () => [],
        },
      };
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      expect(await getTriageSLOTimestamp(octokit, 'test', 1234)).not.toEqual(
        '2023-01-05T16:00:00.000Z'
      );
      expect(sentryCaptureExceptionSpy).toHaveBeenCalledWith(
        new Error(
          'Could not parse timestamp from comments for test/issues/1234'
        )
      );
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
      const now = moment('2022-12-12T17:00:00.000Z');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
      const now = moment('2022-12-12T00:00:00.000Z');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
                text: '2. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '1 hour 0 minutes overdue', type: 'mrkdwn' },
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
        channel: 'channel2',
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
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
                text: '1. <https://test.com/issues/3|#3 &lt;Test Issue 3&gt;>',
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
      const now = moment('2022-12-12T21:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
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
      const now = moment('2022-12-12T17:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
                text: '2. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '3 hours 0 minutes left', type: 'mrkdwn' },
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
      const now = moment('2022-12-12T17:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
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
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
                text: '2. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '1 day left', type: 'mrkdwn' },
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
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
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
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      await Promise.all(
        constructSlackMessage(
          notificationChannels,
          productAreaToIssuesMap,
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
      const now = moment('2022-12-12T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await Promise.all(
        constructSlackMessage(notificationChannels, productAreaToIssuesMap, now)
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
                text: '1. <https://test.com/issues/1|#1 Test Issue>',
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
  });
});
