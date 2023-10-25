import moment from 'moment-timezone';

import {
  EPD_LEADERSHIP_CHANNEL_ID,
  PRODUCT_OWNERS_INFO,
  TEAM_OSPO_CHANNEL_ID,
} from '@/config';
import { getDiscussionEvents, getIssueEventsForTeam } from '@/utils/scores';
import { GitHubOrg } from '@api/github/org';
import { bolt } from '@api/slack';

type teamScoreInfo = {
  team: string;
  score: number;
  eventsTriagedOnTime: number;
  numEvents: number;
};

type discussionInfo = {
  title: string;
  repository: string;
  discussion_number: string;
  num_comments: number;
};

type discussionCommenterInfo = {
  username: string;
  num_comments: number;
};

const TEAM_COLUMN_WIDTH = 30;
const SCORE_COLUMN_WIDTH = 15;
const DISCUSSION_COLUMN_WIDTH = 50;
const NUM_COMMENTS_COLUMN_WIDTH = 15;
const NUM_ROW_SPACES = 3;
const LESS_THAN_SIGN_LENGTH = 1;
const NUM_DISCUSSION_SCOREBOARD_ELEMENTS = 5;
const TEAM_PREFIX = 'team-';

export const sendGitHubEngagementMetrics = async () => {
  const teamScores: teamScoreInfo[] = await Promise.all(
    Object.keys(PRODUCT_OWNERS_INFO['teams']).map(async (team: string) => {
      // Filter out issues that are not yet due
      const issueTriageEvents = (await getIssueEventsForTeam(team)).filter(
        (issue) => moment(issue.triage_by_dt.value) <= moment()
      );
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
    const scoreText = `${score.padStart(3, ' ')} (${
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
    channel: EPD_LEADERSHIP_CHANNEL_ID,
    text: 'Weekly GitHub Team Scores',
    blocks: messageBlocks,
  });
};

export const sendDiscussionMetrics = async () => {
  const { discussions, discussionCommenters } = await getDiscussionEvents();
  if (discussions.length === 0 && discussionCommenters.length === 0) {
    return;
  }
  const messageBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🗓️ Weekly Discussion Metrics 🗓️',
        emoji: true,
      },
    },
  ];
  const addSpaces = (entry: string, column: string) => {
    if (column === 'discussion') {
      return (
        entry +
        ' '.repeat(
          DISCUSSION_COLUMN_WIDTH + LESS_THAN_SIGN_LENGTH - entry.length
        )
      );
    } else if (column === 'firstColumnItem') {
      return entry + ' '.repeat(DISCUSSION_COLUMN_WIDTH - entry.length);
    }
    return entry + ' '.repeat(NUM_COMMENTS_COLUMN_WIDTH - entry.length);
  };
  let firstColumnName = 'Most Active Discussions this Week';
  const secondColumnName = '# comments';
  let scoreBoard = `\n┌${'─'.repeat(
    DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┐\n| ${addSpaces(firstColumnName, 'firstColumnItem')}│ ${addSpaces(
    secondColumnName,
    'numComments'
  )}|\n├${'─'.repeat(
    DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┤\n`;
  discussions
    .slice(0, NUM_DISCUSSION_SCOREBOARD_ELEMENTS)
    .forEach((discussionInfo: discussionInfo) => {
      // Append less than sign here, because trailing spaces are ignored for text within the <> blocks for a hyperlink
      const truncatedDiscussionTitle =
        discussionInfo.title.length <= DISCUSSION_COLUMN_WIDTH
          ? discussionInfo.title + '>'
          : `${discussionInfo.title.slice(0, DISCUSSION_COLUMN_WIDTH - 3)}...>`;
      const truncatedDiscussionTitleWithSpaces = addSpaces(
        truncatedDiscussionTitle,
        'discussion'
      );
      const discussionText = `<https://github.com/${discussionInfo.repository}/discussions/${discussionInfo.discussion_number}|${truncatedDiscussionTitleWithSpaces}`;
      const numCommentsText = addSpaces(
        discussionInfo.num_comments.toString(),
        'numComments'
      );
      scoreBoard += `| ${discussionText}| ${numCommentsText}|\n`;
    });
  scoreBoard += `└${'─'.repeat(
    DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┘`;
  firstColumnName = 'Most Active Sentaurs this Week';
  scoreBoard += `\n┌${'─'.repeat(
    DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┐\n| ${addSpaces(firstColumnName, 'firstColumnItem')}│ ${addSpaces(
    secondColumnName,
    'numComments'
  )}|\n├${'─'.repeat(
    DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
  )}┤\n`;
  discussionCommenters
    .slice(0, NUM_DISCUSSION_SCOREBOARD_ELEMENTS)
    .forEach((discussionCommenterInfo: discussionCommenterInfo) => {
      const usernameText = addSpaces(
        discussionCommenterInfo.username,
        'firstColumnItem'
      );
      const numCommentsText = addSpaces(
        discussionCommenterInfo.num_comments.toString(),
        'numComments'
      );
      scoreBoard += `| ${usernameText}| ${numCommentsText}|\n`;
    });
  scoreBoard += `└${'─'.repeat(
    DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
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
    text: 'Weekly Discussion Metrics',
    blocks: messageBlocks,
  });
};

export const triggerSlackScores = async (
  org: GitHubOrg,
  __now: moment.Moment
) => {
  if (org.slug !== 'getsentry') {
    return;
  }
  await sendGitHubEngagementMetrics();
  await sendDiscussionMetrics();
};
