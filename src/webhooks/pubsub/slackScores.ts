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
const NUM_ROW_SPACES = 3;
const TEAM_PREFIX = 'team-';

export const triggerSlackScores = async (
  __org: GitHubOrg,
  __now: moment.Moment
) => {
  const teamScores: teamScoreInfo[] = await Promise.all(
    Object.keys(PRODUCT_OWNERS_INFO['teams']).map(async (team: string) => {
      const issueTriageEvents = await getIssueEventsForTeam(team);
      const triagedOnTimeEvents = issueTriageEvents.filter(
        (issue) => issue.triaged_dt.value <= issue.triage_by_dt.value
      );
      // For teams with 0 events, set the score to 0 instead of NaN to ensure those teams
      // end up on the bottom of the scoreboard automatically.
      const score =
        issueTriageEvents.length === 0
          ? 0
          : triagedOnTimeEvents.length / issueTriageEvents.length;
      return {
        team: team.slice(TEAM_PREFIX.length),
        score,
        eventsTriagedOnTime: triagedOnTimeEvents.length,
        numEvents: issueTriageEvents.length,
      };
    })
  );

  const sortTeams = (a: teamScoreInfo, b: teamScoreInfo) => {
    // First sort by scores
    const scoreDiff = b.score - a.score;
    if (scoreDiff === 0) {
      // Then sort by num of events
      const numIssuesDiff = b.numEvents - a.numEvents;
      if (numIssuesDiff === 0) {
        // Finally sort by alphabetical order
        return a.team.localeCompare(b.team);
      }
      return numIssuesDiff;
    }
    return scoreDiff;
  };
  teamScores.sort(sortTeams);
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
  let scoreBoard = `\n┌${'─'.repeat(
    TEAM_COLUMN_WIDTH + SCORE_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┐\n| Team                          │ % on Time      |\n├${'─'.repeat(
    TEAM_COLUMN_WIDTH + SCORE_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┤\n`;
  const addSpaces = (entry: string, column: string) => {
    if (column === 'team') {
      return entry + ' '.repeat(TEAM_COLUMN_WIDTH - entry.length);
    }
    return entry + ' '.repeat(SCORE_COLUMN_WIDTH - entry.length);
  };
  teamScores.forEach((teamScoreInfo: teamScoreInfo) => {
    const score: string =
      teamScoreInfo.score === 0 && teamScoreInfo.numEvents === 0
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
  scoreBoard += `└${'─'.repeat(
    TEAM_COLUMN_WIDTH + SCORE_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┘`;
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
