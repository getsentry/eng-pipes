import { bolt } from '@api/slack';
import * as scoresUtils from '@utils/scores';

import { triggerSlackScores } from './slackScores';

describe('slackScores Tests', function () {
  let getIssueEventsForTeamSpy, postMessageSpy;
  beforeAll(() => {
    getIssueEventsForTeamSpy = jest.spyOn(scoresUtils, 'getIssueEventsForTeam');
    postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle case when no issues are returned', async () => {
    getIssueEventsForTeamSpy.mockReturnValue([]);
    await triggerSlackScores(null, null);
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
      channel: 'G01F3FQ0T41',
      text: 'Weekly GitHub Team Scores',
    });
  });

  it('should handle case when issues are returned and sorted by best response times', async () => {
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
      .mockReturnValueOnce([
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
          triaged_dt: { value: '2023-10-13T16:53:15.000Z' },
          triage_by_dt: { value: '2023-10-12T21:52:14.223Z' },
        },
      ])
      .mockReturnValue([]);
    await triggerSlackScores(null, null);
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
| ospo                          | 100 (1/1)      |
| issues                        |  50 (1/2)      |
| enterprise                    |   0 (0/1)      |
| ingest                        |   - (0/0)      |
| null                          |   - (0/0)      |
└────────────────────────────────────────────────┘\`\`\``,
            type: 'mrkdwn',
          },
          type: 'section',
        },
      ],
      channel: 'G01F3FQ0T41',
      text: 'Weekly GitHub Team Scores',
    });
  });
});
