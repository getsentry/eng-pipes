import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { bolt } from '@api/slack';
import { db } from '@utils/db';

import {
  constructSlackMessage,
  getTriageSLOTimestamp,
  notifyTeamsForUntriagedIssues,
} from '.';

describe('Triage Notification Tests', function () {
  beforeAll(async function () {
    await db.migrate.latest();
  });
  afterAll(async function () {
    await db.destroy();
  });
  describe('getTriageSLOTimestamp', function () {
    const sampleComment = {
      user: {
        type: 'Bot',
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
  });
  describe('constructSlackMessage', function () {
    let boltPostMessageSpy;
    beforeEach(function () {
      boltPostMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    });
    afterEach(function () {
      jest.clearAllMocks();
    });
    it('should return empty promise if no issues are untriaged', async function () {
      const notificationChannels = {
        channel1: ['Team: Test'],
        channel2: ['Team: Test', 'Team: Open Source'],
      };
      const teamToIssuesMap = {
        'Team: Test': [],
        'Team: Open Source': [],
      };
      const now = moment('2022-12-12T00:00:00.000Z');
      Promise.all(
        constructSlackMessage(notificationChannels, teamToIssuesMap, now)
      );
      expect(boltPostMessageSpy).toHaveBeenCalledTimes(0);
    });
    it('should return all issues in overdue if SLA has passed', async function () {
      const notificationChannels = {
        channel1: ['Team: Test'],
        channel2: ['Team: Test', 'Team: Open Source'],
      };
      const teamToIssuesMap = {
        'Team: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            teamLabel: 'Team: Test',
            triageBy: '2022-12-11T21:00:00.000Z',
          },
        ],
        'Team: Open Source': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            teamLabel: 'Team: Open Source',
            triageBy: '2022-12-11T20:00:00.000Z',
          },
        ],
      };
      const now = moment('2022-12-12T00:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      Promise.all(
        constructSlackMessage(notificationChannels, teamToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenNthCalledWith(1, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*\n\n1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '😰\n\n3 hours 0 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenNthCalledWith(2, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*\n\n1. <https://test.com/issues/1|#1 Test Issue>\n2. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              {
                text: '😰\n\n3 hours 0 minutes overdue\n4 hours 0 minutes overdue',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should return all issues in act fast if SLA is approaching', async function () {
      const notificationChannels = {
        channel1: ['Team: Test'],
        channel2: ['Team: Test', 'Team: Open Source'],
      };
      const teamToIssuesMap = {
        'Team: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            teamLabel: 'Team: Test',
            triageBy: '2022-12-11T21:00:00.000Z',
          },
        ],
        'Team: Open Source': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            teamLabel: 'Team: Open Source',
            triageBy: '2022-12-11T20:00:00.000Z',
          },
        ],
      };
      const now = moment('2022-12-11T17:00:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      Promise.all(
        constructSlackMessage(notificationChannels, teamToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenNthCalledWith(1, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*\n\n1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '😨\n\n4 hours 0 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenNthCalledWith(2, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*\n\n1. <https://test.com/issues/1|#1 Test Issue>\n2. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              {
                text: '😨\n\n4 hours 0 minutes left\n3 hours 0 minutes left',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should return all issues in triage queue if SLA is more than 4 hours away', async function () {
      const notificationChannels = {
        channel1: ['Team: Test'],
        channel2: ['Team: Test', 'Team: Open Source'],
      };
      const teamToIssuesMap = {
        'Team: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            teamLabel: 'Team: Test',
            triageBy: '2022-12-11T21:00:00.000Z',
          },
        ],
        'Team: Open Source': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            teamLabel: 'Team: Open Source',
            triageBy: '2022-12-11T20:00:00.000Z',
          },
        ],
      };
      const now = moment('2022-12-10T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      Promise.all(
        constructSlackMessage(notificationChannels, teamToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenNthCalledWith(1, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '⏳ *Triage Queue*\n\n1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '😯\n\n28 hours 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenNthCalledWith(2, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '⏳ *Triage Queue*\n\n1. <https://test.com/issues/1|#1 Test Issue>\n2. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              {
                text: '😯\n\n28 hours 2 minutes left\n27 hours 2 minutes left',
                type: 'mrkdwn',
              },
            ],
            type: 'section',
          },
        ],
        channel: 'channel2',
        text: '👋 Triage Reminder ⏰',
      });
    });
    it('should return issues appropriately in different blocks', async function () {
      const notificationChannels = {
        channel1: ['Team: Test'],
        channel2: ['Team: Test', 'Team: Open Source'],
      };
      const teamToIssuesMap = {
        'Team: Test': [
          {
            url: 'https://test.com/issues/1',
            number: 1,
            title: 'Test Issue',
            teamLabel: 'Team: Test',
            triageBy: '2022-12-11T21:00:00.000Z',
          },
          {
            url: 'https://test.com/issues/3',
            number: 3,
            title: 'Test Issue 2',
            teamLabel: 'Team: Test',
            triageBy: '2022-12-10T19:00:00.000Z',
          },
        ],
        'Team: Open Source': [
          {
            url: 'https://test.com/issues/2',
            number: 2,
            title: 'Open Source Issue',
            teamLabel: 'Team: Open Source',
            triageBy: '2022-12-10T16:00:00.000Z',
          },
        ],
      };
      const now = moment('2022-12-10T16:58:00.000Z');
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      Promise.all(
        constructSlackMessage(notificationChannels, teamToIssuesMap, now)
      );
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenNthCalledWith(1, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*\n\n1. <https://test.com/issues/3|#3 Test Issue 2>',
                type: 'mrkdwn',
              },
              { text: '😨\n\n2 hours 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '⏳ *Triage Queue*\n\n1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '😯\n\n28 hours 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
        ],
        channel: 'channel1',
        text: '👋 Triage Reminder ⏰',
      });
      expect(postMessageSpy).toHaveBeenNthCalledWith(2, {
        blocks: [
          {
            text: {
              text: 'Hey! You have some tickets to triage:',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            fields: [
              {
                text: '🚨 *Overdue*\n\n1. <https://test.com/issues/2|#2 Open Source Issue>',
                type: 'mrkdwn',
              },
              { text: '😰\n\n0 hours 58 minutes overdue', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '⌛️ *Act fast!*\n\n1. <https://test.com/issues/3|#3 Test Issue 2>',
                type: 'mrkdwn',
              },
              { text: '😨\n\n2 hours 2 minutes left', type: 'mrkdwn' },
            ],
            type: 'section',
          },
          {
            fields: [
              {
                text: '⏳ *Triage Queue*\n\n1. <https://test.com/issues/1|#1 Test Issue>',
                type: 'mrkdwn',
              },
              { text: '😯\n\n28 hours 2 minutes left', type: 'mrkdwn' },
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
