import moment from 'moment-timezone';

import { PRODUCT_OWNERS_INFO, TEAM_OSPO_CHANNEL_ID } from '@/config';
import { getIssueEventsForTeam } from '@/utils/scores';
import { GitHubOrg } from '@api/github/org';
import { bolt } from '@api/slack';

type teamScoreInfo = {
  team: string;
  score: number;
  eventsTriagedOnTime: number;
  numEvents: number;
};

const TEAM_COLUMN_WIDTH = 30;
const SCORE_COLUMN_WIDTH = 15;
const TEAM_PREFIX = 'team-';

export const triggerSlackScores = async (
  __org: GitHubOrg,
  __now: moment.Moment
) => {
  const teamScores: teamScoreInfo[] = await Promise.all(
    Object.keys(PRODUCT_OWNERS_INFO['teams']).map(async (team: string) => {
      const issueTriageEvents = await getIssueEventsForTeam(team);
      const triagedEvents = issueTriageEvents.filter(
        (issue) => issue.is_triaged
      );
      const score = triagedEvents.length / issueTriageEvents.length;
      return {
        team: team.slice(TEAM_PREFIX.length),
        score,
        eventsTriagedOnTime: triagedEvents.length,
        numEvents: issueTriageEvents.length,
      };
    })
  );
  // sort the team scores in descending order
  teamScores.sort((a: teamScoreInfo, b: teamScoreInfo) => b.score - a.score);
  const messageBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🗓️ Weekly GitHub Response Times by Team 🗓️',
        emoji: true,
      },
    },
  ];
  let scoreBoard =
    '┌────────────────────────────────────────────────┐\n| Team                          │ % on Time      |\n├────────────────────────────────────────────────┤\n';
  const addSpaces = (entry: string, column: string) => {
    if (column === 'team') {
      return entry + ' '.repeat(TEAM_COLUMN_WIDTH - entry.length);
    }
    return entry + ' '.repeat(SCORE_COLUMN_WIDTH - entry.length);
  };
  teamScores.forEach((teamScoreInfo: teamScoreInfo) => {
    const score: string = Number.isNaN(teamScoreInfo.score)
      ? '-'
      : (teamScoreInfo.score * 100).toFixed(0).toString();
    const teamText = `${teamScoreInfo.team}`;
    const scoreText = `${score.padEnd(3, ' ')} (${
      teamScoreInfo.eventsTriagedOnTime
    }/${teamScoreInfo.numEvents})`;
    scoreBoard += `| ${addSpaces(teamText, 'team')}| ${addSpaces(
      scoreText,
      'score'
    )}|\n`;
  });
  scoreBoard += `└────────────────────────────────────────────────┘`;
  messageBlocks.push({
    type: 'section',
    // Unsure why, but ts is complaining about missing emoji field, but slack api rejects the field
    // @ts-ignore
    text: {
      type: 'mrkdwn',
      text: '```' + scoreBoard + '```',
    },
  });
  await bolt.client.chat.postMessage({
    channel: TEAM_OSPO_CHANNEL_ID,
    text: 'Weekly GitHub Team Scores',
    blocks: messageBlocks,
  });
};
