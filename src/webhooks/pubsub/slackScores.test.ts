import { GETSENTRY_ORG, GH_ORGS } from '@/config';
import { bolt } from '@api/slack';
import * as scoresUtils from '@utils/scores';

import * as getAPIsStatsMessage from '../../brain/apis/getStatsMessage';
import {
  DISCUSS_PRODUCT_CHANNEL_ID,
  TEAM_OSPO_CHANNEL_ID,
  TEAM_PRODUCT_OWNERS_CHANNEL_ID,
} from '../../config';

import {
  sendDiscussionMetrics,
  sendGitHubEngagementMetrics,
  triggerSlackScores,
} from './slackScores';

describe('slackScores tests', function () {
  let getIssueEventsForTeamSpy,
    getDiscussionEventsSpy,
    postMessageSpy,
    getStatsMessageSpy;
  beforeAll(() => {
    getIssueEventsForTeamSpy = jest.spyOn(scoresUtils, 'getIssueEventsForTeam');
    getDiscussionEventsSpy = jest.spyOn(scoresUtils, 'getDiscussionEvents');
    getStatsMessageSpy = jest.spyOn(getAPIsStatsMessage, 'getStatsMessage');
    getStatsMessageSpy.mockImplementation(() => {
      return {
        messages: ['Some random message'],
        should_show_docs: false,
        goal: 50,
        review_link: getAPIsStatsMessage.OWNERSHIP_FILE_LINK,
      };
    });
    postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerSlackScores tests', () => {
    it('should not post message when org is codecov', async () => {
      getIssueEventsForTeamSpy.mockReturnValue([]);
      getDiscussionEventsSpy.mockReturnValue({
        discussions: [],
        discussionCommenters: [],
      });
      await triggerSlackScores(GH_ORGS.get('codecov'), null);
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });

    it('should post message when org is getsentry', async () => {
      getIssueEventsForTeamSpy.mockReturnValue([]);
      getDiscussionEventsSpy.mockReturnValue({
        discussions: [],
        discussionCommenters: [],
      });
      await triggerSlackScores(GETSENTRY_ORG, null);
      expect(postMessageSpy).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'API Publish Stats By Team',
        })
      );
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
          channel: TEAM_OSPO_CHANNEL_ID,
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
| enterprise                    |   - (0/0)      |
| ingest                        |   - (0/0)      |
| issues                        |   - (0/0)      |
| null                          |   - (0/0)      |
| ospo                          |   - (0/0)      |
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
| ospo                          | 100 (1/1)      |
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
| enterprise                    |   - (0/0)      |
| ingest                        |   - (0/0)      |
| issues                        |   - (0/0)      |
| null                          |   - (0/0)      |
| ospo                          |   - (0/0)      |
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
| ospo                          | 100 (1/1)      |
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

  describe('sendDiscussionMetrics tests', () => {
    it('should not send message if there was no activity from discussions in the last week', async () => {
      getDiscussionEventsSpy.mockReturnValue({
        discussions: [],
        discussionCommenters: [],
      });
      expect(postMessageSpy).not.toHaveBeenCalled();
    });

    it('should send discussion metrics properly to ospo team channel for testing', async () => {
      const discussions = [
        {
          title: 'Discussion 1',
          repository: 'routing-repo',
          discussion_number: '001',
          num_comments: 3,
        },
      ];
      const discussionCommenters = [
        {
          username: 'luke_skywalker',
          num_comments: 2,
        },
      ];
      getDiscussionEventsSpy.mockReturnValue({
        discussions,
        discussionCommenters,
      });
      await sendDiscussionMetrics(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: TEAM_OSPO_CHANNEL_ID,
        })
      );
    });

    it('should send discussion metrics properly for under 5 discussions/users commented', async () => {
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
      const discussionCommenters = [
        {
          username: 'luke_skywalker',
          num_comments: 2,
        },
        {
          username: 'han_solo',
          num_comments: 1,
        },
      ];
      getDiscussionEventsSpy.mockReturnValue({
        discussions,
        discussionCommenters,
      });
      await sendDiscussionMetrics();
      // Columns with links in them may seem a bit off, because the links won't actually appear in slack
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly Discussion Metrics 🗓️',
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
| <https://github.com/test-ttt-simple/discussions/003|Overflowing Discussion Title blahblahblahblahb...> |              1 |
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
        text: 'Weekly Discussion Metrics',
      });
    });

    it('should properly ignore ` character in discussion title', async () => {
      const discussions = [
        {
          title: 'Discussion with `markdown`',
          repository: 'routing-repo',
          discussion_number: '001',
          num_comments: 3,
        },
      ];
      const discussionCommenters = [
        {
          username: 'luke_skywalker',
          num_comments: 2,
        },
        {
          username: 'han_solo',
          num_comments: 1,
        },
      ];
      getDiscussionEventsSpy.mockReturnValue({
        discussions,
        discussionCommenters,
      });
      await sendDiscussionMetrics();
      // Columns with links in them may seem a bit off, because the links won't actually appear in slack
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly Discussion Metrics 🗓️',
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
        text: 'Weekly Discussion Metrics',
      });
    });

    it('should send discussion metrics properly for over 5 discussions/users commented', async () => {
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
      const discussionCommenters = [
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
      getDiscussionEventsSpy.mockReturnValue({
        discussions,
        discussionCommenters,
      });
      await sendDiscussionMetrics();
      // Columns with links in them may seem a bit off, because the links won't actually appear in slack
      expect(postMessageSpy).toHaveBeenCalledWith({
        blocks: [
          {
            text: {
              emoji: true,
              text: '🗓️ Weekly Discussion Metrics 🗓️',
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
        text: 'Weekly Discussion Metrics',
      });
    });
  });
});
