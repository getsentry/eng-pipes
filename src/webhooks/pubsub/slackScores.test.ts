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
            text: '🗓️ Weekly Team GitHub Engagement Scores 🗓️',
            type: 'plain_text',
          },
          type: 'header',
        },
        {
          text: {
            text: `\`\`\`┌──────────────────────────────────────────────────────────┐
| Team                          │ GitHub Responses on Time |
├──────────────────────────────────────────────────────────┤
| ospo                          | 0/0 (100%)               |
| enterprise                    | 0/0 (100%)               |
| issues                        | 0/0 (100%)               |
| ingest                        | 0/0 (100%)               |
| null                          | 0/0 (100%)               |
└──────────────────────────────────────────────────────────┘\`\`\``,
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
          is_triaged: true,
        },
      ])
      .mockReturnValueOnce([
        {
          issue_id: 2,
          repository: 'routing-repo',
          product_area: 'Multi-Team',
          is_triaged: false,
        },
      ])
      .mockReturnValueOnce([
        {
          issue_id: 3,
          repository: 'routing-repo',
          product_area: 'Test',
          is_triaged: true,
        },
        {
          issue_id: 4,
          repository: 'routing-repo',
          product_area: 'Test',
          is_triaged: false,
        },
      ])
      .mockReturnValue([]);
    await triggerSlackScores(null, null);
    expect(postMessageSpy).toHaveBeenCalledWith({
      blocks: [
        {
          text: {
            emoji: true,
            text: '🗓️ Weekly Team GitHub Engagement Scores 🗓️',
            type: 'plain_text',
          },
          type: 'header',
        },
        {
          text: {
            text: `\`\`\`┌──────────────────────────────────────────────────────────┐
| Team                          │ GitHub Responses on Time |
├──────────────────────────────────────────────────────────┤
| ospo                          | 1/1 (100%)               |
| ingest                        | 0/0 (100%)               |
| null                          | 0/0 (100%)               |
| issues                        | 1/2 (50%)                |
| enterprise                    | 0/1 (0%)                 |
└──────────────────────────────────────────────────────────┘\`\`\``,
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
