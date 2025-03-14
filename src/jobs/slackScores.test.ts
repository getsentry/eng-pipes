import { OAuth2Client } from 'google-auth-library';

import { GETSENTRY_ORG, GH_ORGS } from '@/config';
import * as scoresUtils from '@/utils/db/scores';
import { bolt } from '@api/slack';

import {
  DISCUSS_PRODUCT_CHANNEL_ID,
  TEAM_DEV_INFRA_CHANNEL_ID,
  TEAM_PRODUCT_OWNERS_CHANNEL_ID,
} from '../config';

import {
  sendGitHubActivityMetrics,
  sendGitHubEngagementMetrics,
  triggerSlackScores,
} from './slackScores';

describe('slackScores tests', function () {
  let getIssueEventsForTeamSpy, getGithubActivityMetricsSpy, postMessageSpy;
  beforeAll(() => {
    getIssueEventsForTeamSpy = jest.spyOn(scoresUtils, 'getIssueEventsForTeam');
    getGithubActivityMetricsSpy = jest.spyOn(
      scoresUtils,
      'getGitHubActivityMetrics'
    );

    postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(jest.fn());
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerSlackScores tests', () => {
    it('should not post message when org is codecov', async () => {
      getIssueEventsForTeamSpy.mockReturnValue([]);
      getGithubActivityMetricsSpy.mockReturnValue({
        discussions: [],
        issues: [],
        gitHubCommenters: [],
      });
      // second arg is not used
      await triggerSlackScores(GH_ORGS.get('codecov'));
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });

    it('should post message when org is getsentry', async () => {
      getIssueEventsForTeamSpy.mockReturnValue([]);
      getGithubActivityMetricsSpy.mockReturnValue({
        discussions: [],
        issues: [],
        gitHubCommenters: [],
      });
      await triggerSlackScores(GETSENTRY_ORG);
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Weekly GitHub Team Scores',
        })
      );
    });
  });

  describe('sendGitHubEngagementMetrics tests', () => {
    it('should send slack notifications to correct channels', async () => {
      getIssueEventsForTeamSpy.mockReturnValue([]);
      await sendGitHubEngagementMetrics();
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: TEAM_PRODUCT_OWNERS_CHANNEL_ID,
        })
      );
    });

    it('should send slack notifications to correct channels if test is passed in', async () => {
      getIssueEventsForTeamSpy.mockReturnValue([]);
      await sendGitHubEngagementMetrics(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: TEAM_DEV_INFRA_CHANNEL_ID,
        })
      );
    });

    it('should handle case when no issues are returned', async () => {
      getIssueEventsForTeamSpy.mockReturnValue([]);
      await sendGitHubEngagementMetrics();
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly GitHub Response Times by Team 🗓️',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            text: {
              text: `\`\`\`
┌────────────────────────────────────────────────┐
| Team                          │ % on Time      |
├────────────────────────────────────────────────┤
| No Volume                                      |
├────────────────────────────────────────────────┤
| dev-infra                     |   - (0/0)      |
| enterprise                    |   - (0/0)      |
| ingest                        |   - (0/0)      |
| issues                        |   - (0/0)      |
| null                          |   - (0/0)      |
└────────────────────────────────────────────────┘\`\`\``,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: TEAM_PRODUCT_OWNERS_CHANNEL_ID,
        text: 'Weekly GitHub Team Scores',
      });
    });

    it('should handle case when issues are returned and sorted by best response times', async () => {
      const highVolumeIssueEvents = new Array(30)
        .fill([
          {
            issue_id: 3,
            repository: 'routing-repo',
            product_area: 'Test',
            triaged_dt: { value: '2023-10-11T16:53:15.000Z' },
            triage_by_dt: { value: '2023-10-12T21:52:14.223Z' },
          },
          {
            issue_id: 4,
            repository: 'routing-repo',
            product_area: 'Test',
            triaged_dt: null,
            triage_by_dt: { value: '2023-10-12T21:52:14.223Z' },
          },
        ])
        .flat();
      getIssueEventsForTeamSpy
        .mockReturnValueOnce([
          {
            issue_id: 1,
            repository: 'routing-repo',
            product_area: 'One-Team',
            triaged_dt: { value: '2023-10-11T16:53:15.000Z' },
            triage_by_dt: { value: '2023-10-12T21:52:14.223Z' },
          },
        ])
        .mockReturnValueOnce([
          {
            issue_id: 2,
            repository: 'routing-repo',
            product_area: 'Multi-Team',
            triaged_dt: { value: '2023-10-13T16:53:15.000Z' },
            triage_by_dt: { value: '2023-10-12T21:52:14.223Z' },
          },
        ])
        .mockReturnValueOnce(highVolumeIssueEvents)
        .mockReturnValue([]);
      await sendGitHubEngagementMetrics();
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly GitHub Response Times by Team 🗓️',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            text: {
              text: `\`\`\`
┌────────────────────────────────────────────────┐
| Team                          │ % on Time      |
├────────────────────────────────────────────────┤
| High Volume                                    |
├────────────────────────────────────────────────┤
| issues                        |  50 (30/60)    |
├────────────────────────────────────────────────┤
| Low Volume                                     |
├────────────────────────────────────────────────┤
| dev-infra                     | 100 (1/1)      |
| enterprise                    |   0 (0/1)      |
├────────────────────────────────────────────────┤
| No Volume                                      |
├────────────────────────────────────────────────┤
| ingest                        |   - (0/0)      |
| null                          |   - (0/0)      |
└────────────────────────────────────────────────┘\`\`\``,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: TEAM_PRODUCT_OWNERS_CHANNEL_ID,
        text: 'Weekly GitHub Team Scores',
      });
    });

    it('should ignore issue if it is not due yet and not triaged', async () => {
      getIssueEventsForTeamSpy
        .mockReturnValueOnce([
          {
            issue_id: 1,
            repository: 'routing-repo',
            product_area: 'One-Team',
            triaged_dt: null,
            triage_by_dt: { value: '9999-10-12T21:52:14.223Z' },
          },
        ])
        .mockReturnValue([]);
      await sendGitHubEngagementMetrics();
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly GitHub Response Times by Team 🗓️',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            text: {
              text: `\`\`\`
┌────────────────────────────────────────────────┐
| Team                          │ % on Time      |
├────────────────────────────────────────────────┤
| No Volume                                      |
├────────────────────────────────────────────────┤
| dev-infra                     |   - (0/0)      |
| enterprise                    |   - (0/0)      |
| ingest                        |   - (0/0)      |
| issues                        |   - (0/0)      |
| null                          |   - (0/0)      |
└────────────────────────────────────────────────┘\`\`\``,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: TEAM_PRODUCT_OWNERS_CHANNEL_ID,
        text: 'Weekly GitHub Team Scores',
      });
    });

    it('should count issue if it is not due yet and already triaged', async () => {
      getIssueEventsForTeamSpy
        .mockReturnValueOnce([
          {
            issue_id: 1,
            repository: 'routing-repo',
            product_area: 'One-Team',
            triaged_dt: { value: '2023-10-12T21:52:14.223Z' },
            triage_by_dt: { value: '9999-10-12T21:52:14.223Z' },
          },
        ])
        .mockReturnValue([]);
      await sendGitHubEngagementMetrics();
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly GitHub Response Times by Team 🗓️',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            text: {
              text: `\`\`\`
┌────────────────────────────────────────────────┐
| Team                          │ % on Time      |
├────────────────────────────────────────────────┤
| Low Volume                                     |
├────────────────────────────────────────────────┤
| dev-infra                     | 100 (1/1)      |
├────────────────────────────────────────────────┤
| No Volume                                      |
├────────────────────────────────────────────────┤
| enterprise                    |   - (0/0)      |
| ingest                        |   - (0/0)      |
| issues                        |   - (0/0)      |
| null                          |   - (0/0)      |
└────────────────────────────────────────────────┘\`\`\``,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: TEAM_PRODUCT_OWNERS_CHANNEL_ID,
        text: 'Weekly GitHub Team Scores',
      });
    });
  });

  describe('sendGitHubActivityMetrics tests', () => {
    it('should not send message if there was no activity from discussions or issues in the last week', async () => {
      getGithubActivityMetricsSpy.mockReturnValue({
        discussions: [],
        issues: [],
        gitHubCommenters: [],
      });
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('should send github activity metrics properly to dev-infra team channel for testing', async () => {
      const discussions = [
        {
          title: 'Discussion 1',
          repository: 'routing-repo',
          discussion_number: '001',
          num_comments: 3,
        },
      ];
      const gitHubCommenters = [
        {
          username: 'luke_skywalker',
          num_comments: 2,
        },
      ];
      const issues = [
        {
          title: 'Issue 1',
          repository: 'routing-repo',
          issue_number: '001',
          num_comments: 3,
        },
      ];
      getGithubActivityMetricsSpy.mockReturnValue({
        discussions,
        issues,
        gitHubCommenters,
      });
      await sendGitHubActivityMetrics(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: TEAM_DEV_INFRA_CHANNEL_ID,
        })
      );
    });

    it('should send github activity metrics properly for under 5 discussions/issues/users commented', async () => {
      const discussions = [
        {
          title: 'Discussion 1',
          repository: 'routing-repo',
          discussion_number: '001',
          num_comments: 3,
        },
        {
          title: 'Discussion 2',
          repository: 'routing-repo',
          discussion_number: '002',
          num_comments: 2,
        },
        {
          title:
            'Overflowing Discussion Title blahblahblahblahblahblahblahblahblahblahblahblahblahblahblahblah',
          repository: 'test-ttt-simple',
          discussion_number: '003',
          num_comments: 1,
        },
      ];
      const issues = [
        {
          title: 'Issue 1',
          repository: 'routing-repo',
          issue_number: '001',
          num_comments: 3,
        },
        {
          title: 'Issue 2',
          repository: 'routing-repo',
          issue_number: '002',
          num_comments: 2,
        },
      ];
      const gitHubCommenters = [
        {
          username: 'luke_skywalker',
          num_comments: 2,
        },
        {
          username: 'han_solo',
          num_comments: 1,
        },
      ];
      getGithubActivityMetricsSpy.mockReturnValue({
        discussions,
        issues,
        gitHubCommenters,
      });
      await sendGitHubActivityMetrics();
      // Columns with links in them may seem a bit off, because the links won't actually appear in slack
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly GitHub Activity 🗓️',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            text: {
              text: `\`\`\`
┌────────────────────────────────────────────────────────────────────┐
| Most Active Discussions this Week                 │     # comments |
├────────────────────────────────────────────────────────────────────┤
| <https://github.com/routing-repo/discussions/001|Discussion 1>                                      |              3 |
| <https://github.com/routing-repo/discussions/002|Discussion 2>                                      |              2 |
| <https://github.com/test-ttt-simple/discussions/003|Overflowing Discussion Title blahblahblahblahbla…> |              1 |
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
| Most Active Issues this Week                      │     # comments |
├────────────────────────────────────────────────────────────────────┤
| <https://github.com/routing-repo/issues/001|Issue 1>                                           |              3 |
| <https://github.com/routing-repo/issues/002|Issue 2>                                           |              2 |
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
| Most Active Sentaurs this Week                    │     # comments |
├────────────────────────────────────────────────────────────────────┤
| luke_skywalker                                    |              2 |
| han_solo                                          |              1 |
└────────────────────────────────────────────────────────────────────┘\`\`\``,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: DISCUSS_PRODUCT_CHANNEL_ID,
        text: 'Weekly GitHub Activity',
      });
    });

    it('should properly ignore ` character in title', async () => {
      const discussions = [
        {
          title: 'Discussion with `markdown`',
          repository: 'routing-repo',
          discussion_number: '001',
          num_comments: 3,
        },
      ];
      const gitHubCommenters = [
        {
          username: 'luke_skywalker',
          num_comments: 2,
        },
        {
          username: 'han_solo',
          num_comments: 1,
        },
      ];
      const issues = [
        {
          title: 'Issue with `markdown`',
          repository: 'routing-repo',
          issue_number: '001',
          num_comments: 3,
        },
      ];
      getGithubActivityMetricsSpy.mockReturnValue({
        discussions,
        issues,
        gitHubCommenters,
      });
      await sendGitHubActivityMetrics();
      // Columns with links in them may seem a bit off, because the links won't actually appear in slack
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly GitHub Activity 🗓️',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            text: {
              text: `\`\`\`
┌────────────────────────────────────────────────────────────────────┐
| Most Active Discussions this Week                 │     # comments |
├────────────────────────────────────────────────────────────────────┤
| <https://github.com/routing-repo/discussions/001|Discussion with markdown>                          |              3 |
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
| Most Active Issues this Week                      │     # comments |
├────────────────────────────────────────────────────────────────────┤
| <https://github.com/routing-repo/issues/001|Issue with markdown>                               |              3 |
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
| Most Active Sentaurs this Week                    │     # comments |
├────────────────────────────────────────────────────────────────────┤
| luke_skywalker                                    |              2 |
| han_solo                                          |              1 |
└────────────────────────────────────────────────────────────────────┘\`\`\``,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: DISCUSS_PRODUCT_CHANNEL_ID,
        text: 'Weekly GitHub Activity',
      });
    });

    it('should send github activity metrics properly for over 5 events in discussion/issues/commenters', async () => {
      const discussions = [
        {
          title: 'Discussion 1',
          repository: 'routing-repo',
          discussion_number: '001',
          num_comments: 6,
        },
        {
          title: 'Discussion 2',
          repository: 'routing-repo',
          discussion_number: '002',
          num_comments: 5,
        },
        {
          title: 'Discussion 3',
          repository: 'test-ttt-simple',
          discussion_number: '003',
          num_comments: 4,
        },
        {
          title: 'Discussion 4',
          repository: 'test-ttt-simple',
          discussion_number: '004',
          num_comments: 3,
        },
        {
          title: 'Discussion 5',
          repository: 'test-ttt-simple',
          discussion_number: '005',
          num_comments: 2,
        },
        {
          title: 'Discussion 6',
          repository: 'test-ttt-simple',
          discussion_number: '006',
          num_comments: 1,
        },
      ];
      const gitHubCommenters = [
        {
          username: 'luke_skywalker',
          num_comments: 10,
        },
        {
          username: 'han_solo',
          num_comments: 5,
        },
        {
          username: 'boba_fett',
          num_comments: 4,
        },
        {
          username: 'darth_vader',
          num_comments: 3,
        },
        {
          username: 'yoda',
          num_comments: 2,
        },
        {
          username: 'anakin_skywalker',
          num_comments: 1,
        },
      ];
      const issues = [
        {
          title: 'Issue 1',
          repository: 'routing-repo',
          issue_number: '001',
          num_comments: 6,
        },
        {
          title: 'Issue 2',
          repository: 'routing-repo',
          issue_number: '002',
          num_comments: 5,
        },
        {
          title: 'Issue 3',
          repository: 'test-ttt-simple',
          issue_number: '003',
          num_comments: 4,
        },
        {
          title: 'Issue 4',
          repository: 'test-ttt-simple',
          issue_number: '004',
          num_comments: 3,
        },
        {
          title: 'Issue 5',
          repository: 'test-ttt-simple',
          issue_number: '005',
          num_comments: 2,
        },
        {
          title: 'Discussion 6',
          repository: 'test-ttt-simple',
          discussion_number: '006',
          num_comments: 1,
        },
      ];
      getGithubActivityMetricsSpy.mockReturnValue({
        discussions,
        issues,
        gitHubCommenters,
      });
      await sendGitHubActivityMetrics();
      // Columns with links in them may seem a bit off, because the links won't actually appear in slack
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly GitHub Activity 🗓️',
              type: 'plain_text',
            },
            type: 'header',
          },
          {
            text: {
              text: `\`\`\`
┌────────────────────────────────────────────────────────────────────┐
| Most Active Discussions this Week                 │     # comments |
├────────────────────────────────────────────────────────────────────┤
| <https://github.com/routing-repo/discussions/001|Discussion 1>                                      |              6 |
| <https://github.com/routing-repo/discussions/002|Discussion 2>                                      |              5 |
| <https://github.com/test-ttt-simple/discussions/003|Discussion 3>                                      |              4 |
| <https://github.com/test-ttt-simple/discussions/004|Discussion 4>                                      |              3 |
| <https://github.com/test-ttt-simple/discussions/005|Discussion 5>                                      |              2 |
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
| Most Active Issues this Week                      │     # comments |
├────────────────────────────────────────────────────────────────────┤
| <https://github.com/routing-repo/issues/001|Issue 1>                                           |              6 |
| <https://github.com/routing-repo/issues/002|Issue 2>                                           |              5 |
| <https://github.com/test-ttt-simple/issues/003|Issue 3>                                           |              4 |
| <https://github.com/test-ttt-simple/issues/004|Issue 4>                                           |              3 |
| <https://github.com/test-ttt-simple/issues/005|Issue 5>                                           |              2 |
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
| Most Active Sentaurs this Week                    │     # comments |
├────────────────────────────────────────────────────────────────────┤
| luke_skywalker                                    |             10 |
| han_solo                                          |              5 |
| boba_fett                                         |              4 |
| darth_vader                                       |              3 |
| yoda                                              |              2 |
└────────────────────────────────────────────────────────────────────┘\`\`\``,
              type: 'mrkdwn',
            },
            type: 'section',
          },
        ],
        channel: DISCUSS_PRODUCT_CHANNEL_ID,
        text: 'Weekly GitHub Activity',
      });
    });
  });
});
