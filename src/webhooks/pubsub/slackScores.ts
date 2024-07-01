import moment from 'moment-timezone';

import { getMessageBlocks } from '@/brain/apis';
import { getStatsMessage } from '@/brain/apis/getStatsMessage';
import {
  DISCUSS_PRODUCT_CHANNEL_ID,
  FEED_ENGINEERING_CHANNEL_ID,
  GETSENTRY_ORG,
  PRODUCT_OWNERS_INFO,
  TEAM_OSPO_CHANNEL_ID,
  TEAM_PRODUCT_OWNERS_CHANNEL_ID,
} from '@/config';
import {
  getGitHubActivityMetrics,
  getIssueEventsForTeam,
} from '@/utils/scores';
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

type issueInfo = {
  title: string;
  repository: string;
  issue_number: string;
  num_comments: number;
};

type commenterInfo = {
  username: string;
  num_comments: number;
};

const TEAM_COLUMN_WIDTH = 30;
const SCORE_COLUMN_WIDTH = 15;
const DISCUSSION_COLUMN_WIDTH = 50;
const NUM_COMMENTS_COLUMN_WIDTH = 15;
const NUM_ROW_SPACES = 3;
const LESS_THAN_SIGN_LENGTH = 1;
const SPACE_LENGTH = 1;
const NUM_DISCUSSION_SCOREBOARD_ELEMENTS = 5;
const TEAM_PREFIX = 'team-';

export const sendApisPublishStatus = async () => {
  const message = await getStatsMessage();
  let messageBlocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'API Publish Stats By Team',
      },
    },
  ];
  messageBlocks = messageBlocks.concat(getMessageBlocks(message));
  await bolt.client.chat.postMessage({
    channel: FEED_ENGINEERING_CHANNEL_ID,
    text: 'API Publish Stats By Team',
    blocks: messageBlocks,
  });
};

export const sendGitHubEngagementMetrics = async (
  ospo_internal: boolean = false
) => {
  const teamScores: teamScoreInfo[] = await Promise.all(
    Object.keys(PRODUCT_OWNERS_INFO['teams']).map(async (team: string) => {
      // Filter for issues that have been due in the past week unless they have been triaged
      const issueTriageEvents = (await getIssueEventsForTeam(team)).filter(
        (issue) =>
          moment(issue.triage_by_dt.value) <= moment() ||
          issue.triaged_dt !== null
      );
      const triagedOnTimeEvents = issueTriageEvents.filter(
        (issue) =>
          issue.triaged_dt !== null &&
          issue.triaged_dt.value <= issue.triage_by_dt.value
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
  )}┐\n| Team                          │ % on Time      |\n`;
  const addSpaces = (entry: string, column: string) => {
    if (column === 'team') {
      return entry + ' '.repeat(TEAM_COLUMN_WIDTH - entry.length);
    }
    return entry + ' '.repeat(SCORE_COLUMN_WIDTH - entry.length);
  };
  let noVolumeRows, lowVolumeRows, highVolumeRows;
  noVolumeRows = lowVolumeRows = highVolumeRows = '';
  teamScores.forEach((teamScoreInfo: teamScoreInfo) => {
    const score: string =
      teamScoreInfo.score === 0 && teamScoreInfo.numEvents === 0
        ? '-'
        : (teamScoreInfo.score * 100).toFixed(0).toString();
    const teamText = `${teamScoreInfo.team}`;
    const scoreText = `${score.padStart(3, ' ')} (${
      teamScoreInfo.eventsTriagedOnTime
    }/${teamScoreInfo.numEvents})`;
    const formattedRow = `| ${addSpaces(teamText, 'team')}| ${addSpaces(
      scoreText,
      'score'
    )}|\n`;
    if (teamScoreInfo.numEvents === 0) {
      noVolumeRows += formattedRow;
    } else if (teamScoreInfo.numEvents < 10) {
      lowVolumeRows += formattedRow;
    } else {
      highVolumeRows += formattedRow;
    }
  });
  const volumeHeader = (volumeText: string) =>
    `├${'─'.repeat(
      TEAM_COLUMN_WIDTH + SCORE_COLUMN_WIDTH + NUM_ROW_SPACES
    )}┤\n| ${
      volumeText +
      ' '.repeat(
        TEAM_COLUMN_WIDTH +
          SCORE_COLUMN_WIDTH +
          NUM_ROW_SPACES -
          volumeText.length -
          SPACE_LENGTH
      )
    }|\n├${'─'.repeat(
      TEAM_COLUMN_WIDTH + SCORE_COLUMN_WIDTH + NUM_ROW_SPACES
    )}┤\n`;
  scoreBoard +=
    highVolumeRows.length > 0
      ? volumeHeader('High Volume') + highVolumeRows
      : '';
  scoreBoard +=
    lowVolumeRows.length > 0 ? volumeHeader('Low Volume') + lowVolumeRows : '';
  scoreBoard +=
    noVolumeRows.length > 0 ? volumeHeader('No Volume') + noVolumeRows : '';
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
  const channelsToPost = ospo_internal
    ? [TEAM_OSPO_CHANNEL_ID]
    : [TEAM_PRODUCT_OWNERS_CHANNEL_ID];
  const slackNotifications = channelsToPost.map((channelId: string) => {
    return bolt.client.chat.postMessage({
      channel: channelId,
      text: 'Weekly GitHub Team Scores',
      blocks: messageBlocks,
    });
  });
  await Promise.all(slackNotifications);
};

export const sendGitHubActivityMetrics = async (
  ospo_internal: boolean = false
) => {
  const { discussions, gitHubCommenters, issues } =
    await getGitHubActivityMetrics();
  if (!discussions.length && !gitHubCommenters.length && !issues.length) {
    return;
  }
  const messageBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🗓️ Weekly GitHub Activity 🗓️',
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
    return (
      ' '.repeat(NUM_COMMENTS_COLUMN_WIDTH - entry.length - SPACE_LENGTH) +
      entry +
      ' '
    );
  };

  const createTable = (
    items: discussionInfo[] | commenterInfo[] | issueInfo[],
    firstColumnName,
    type
  ) => {
    let scoreBoard = `\n┌${'─'.repeat(
      DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
    )}┐\n| ${addSpaces(firstColumnName, 'firstColumnItem')}│ ${addSpaces(
      '# comments',
      'numComments'
    )}|\n├${'─'.repeat(
      DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
    )}┤\n`;
    items.slice(0, NUM_DISCUSSION_SCOREBOARD_ELEMENTS).forEach((itemInfo) => {
      if (type === 'commenters') {
        const usernameText = addSpaces(itemInfo.username, 'firstColumnItem');
        const numCommentsText = addSpaces(
          itemInfo.num_comments.toString(),
          'numComments'
        );
        scoreBoard += `| ${usernameText}| ${numCommentsText}|\n`;
      } else {
        // This is the correct char-by-char representation of a string that may have unicode chars
        const segmentizedTitle = Array.from(new Intl.Segmenter().segment(itemInfo.title));
        // Append less than sign here, because trailing spaces are ignored for text within the <> blocks for a hyperlink
        const truncatedDiscussionTitle =
          segmentizedTitle.length <= DISCUSSION_COLUMN_WIDTH
            ? itemInfo.title + '>'
            : `${segmentizedTitle.slice(0, DISCUSSION_COLUMN_WIDTH - 1)}…> `;
        const truncatedDiscussionTitleWithSpaces = addSpaces(
          // Remove all instances of ` char from string
          truncatedDiscussionTitle.replace(/`/g, ''),
          'discussion'
        );
        const link =
          type === 'discussions'
            ? `https://github.com/${itemInfo.repository}/discussions/${itemInfo.discussion_number}`
            : `https://github.com/${itemInfo.repository}/issues/${itemInfo.issue_number}`;
        const discussionText = `<${link}|${truncatedDiscussionTitleWithSpaces}`;
        const numCommentsText = addSpaces(
          itemInfo.num_comments.toString(),
          'numComments'
        );
        scoreBoard += `| ${discussionText}| ${numCommentsText}|\n`;
      }
    });
    scoreBoard += `└${'─'.repeat(
      DISCUSSION_COLUMN_WIDTH + NUM_COMMENTS_COLUMN_WIDTH + NUM_ROW_SPACES
    )}┘`;
    return scoreBoard;
  };
  const scoreBoard =
    createTable(
      discussions,
      'Most Active Discussions this Week',
      'discussions'
    ) +
    createTable(issues, 'Most Active Issues this Week', 'issues') +
    createTable(
      gitHubCommenters,
      'Most Active Sentaurs this Week',
      'commenters'
    );
  messageBlocks.push({
    type: 'section',
    // Unsure why, but ts is complaining about missing emoji field, but slack api rejects the field
    // @ts-ignore
    text: {
      type: 'mrkdwn',
      text: '```' + scoreBoard + '```',
    },
  });
  const channelToPost = ospo_internal
    ? TEAM_OSPO_CHANNEL_ID
    : DISCUSS_PRODUCT_CHANNEL_ID;
  await bolt.client.chat.postMessage({
    channel: channelToPost,
    text: 'Weekly GitHub Activity',
    blocks: messageBlocks,
  });
};

export const triggerSlackScores = async (
  org: GitHubOrg,
  __now: moment.Moment
) => {
  if (org !== GETSENTRY_ORG) {
    return;
  }
  await Promise.all([
    sendApisPublishStatus(),
    sendGitHubActivityMetrics(),
    sendGitHubEngagementMetrics(),
  ]);
};
