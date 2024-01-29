import getOwnershipData from './getOwnershipData';

export const OWNERSHIP_FILE_LINK =
  'https://github.com/getsentry/sentry-api-schema/blob/main/api_ownership_stats_dont_modify.json';
export const INVALID_TEAM_ERROR = 'INVALID_TEAM_ERROR';
const SLACK_MESSAGE_LIMIT = 3000;

type TeamData = {
  blockStart: number;
  public: Array<String>;
  private: Array<String>;
  experimental: Array<String>;
  unknown: Array<String>;
};

const COLUMN_WIDTH = 21;
function getEmojiForType(type: string, api_rate: number) {
  switch (type) {
    case 'public':
      return api_rate === 0
        ? ':bufo-sad:'
        : api_rate < 20
        ? ':bufo-facepalm:'
        : api_rate > 50
        ? ':bufo-silly-goose-dance:'
        : '';
    case 'private':
      return '';
    case 'unknown':
    case 'experimental':
      return api_rate === 0
        ? ':bufo-party:'
        : api_rate > 50
        ? ':bufo-sad:'
        : ':bufo-facepalm:';
    default:
      return '';
  }
}

function getShortMessageForType(team_data, type, total) {
  const api_rate = Math.round((team_data[type].length * 100) / total);
  const rate_string = strAdjustLength(api_rate.toString(), 3);
  return strAdjustLength(`${rate_string}`, type.length + 3);
}

function getMessageLineForType(team_data, type, total) {
  const api_rate = Math.round((team_data[type].length * 100) / total);
  const emoji = getEmojiForType(type, api_rate);
  return `• ${type}: ${team_data[type].length} (${api_rate}%) ${emoji} \n`;
}

function getTotalApisForTeam(team_data): number {
  return (
    team_data['public'].length +
    team_data['private'].length +
    team_data['experimental'].length +
    team_data['unknown'].length
  );
}

function getMessageForTeam(ownership_data, team) {
  const team_data = ownership_data[team];
  const total = getTotalApisForTeam(team_data);
  return {
    messages: [
      `Publish status for ${team} APIs:\n` +
        getMessageLineForType(team_data, 'public', total) +
        getMessageLineForType(team_data, 'private', total) +
        getMessageLineForType(team_data, 'experimental', total) +
        getMessageLineForType(team_data, 'unknown', total),
    ],
    goal: Math.round((team_data['unknown'].length * 100) / total),
    should_show_docs:
      team_data['unknown'].length + team_data['experimental'].length > 0,
    review_link: `${OWNERSHIP_FILE_LINK}#L${team_data['block_start']}`,
  };
}

function strAdjustLength(word: string, target: number) {
  if (word.length < target) {
    return word + ' '.repeat(target - word.length);
  }
  return word;
}

function getOverallStats(ownership_data) {
  const response_lines: Array<string> = [];
  let total_apis: number = 0;
  let unknown_apis: number = 0;
  response_lines.push(
    strAdjustLength('Team Name', COLUMN_WIDTH) +
      '| Public(%) | Private(%) | Experimental(%) | Unknown(%)\n'
  );

  const typed_ownership_data: Map<string, TeamData> = new Map();
  ownership_data.forEach((value, key) => {
    const teamData: TeamData = {
      blockStart: value['block_start'],
      public: value['public'],
      private: value['private'],
      unknown: value['unknown'],
      experimental: value['experimental'],
    };
    typed_ownership_data.set(key, teamData);
  });
  const sorted_data = new Map(
    [...typed_ownership_data.entries()].sort((a, b) => {
      return a[0].localeCompare(b[0]);
    })
  );

  sorted_data.forEach((team_data, team) => {
    const total = getTotalApisForTeam(team_data);
    total_apis += total;
    unknown_apis += team_data['unknown'].length;
    response_lines.push(
      `<${OWNERSHIP_FILE_LINK}#L${team_data.blockStart}|${team}>` +
        strAdjustLength('', COLUMN_WIDTH - team.length) +
        '| ' +
        getShortMessageForType(team_data, 'public', total) +
        ' | ' +
        getShortMessageForType(team_data, 'private', total) +
        ' | ' +
        getShortMessageForType(team_data, 'experimental', total) +
        ' | ' +
        getShortMessageForType(team_data, 'unknown', total) +
        '\n'
    );
  });
  // Slack messages can't be longer than 3000 characters so splitting the message into
  // multiple ones
  const messages: Array<string> = [];
  let message: string = '';
  response_lines.forEach((line, index) => {
    const result = message + line;
    if (result.length <= SLACK_MESSAGE_LIMIT) {
      message = result;
      if (index === response_lines.length - 1) {
        messages.push(message);
      }
    } else {
      messages.push(message);
      message = line;
    }
  });

  const goal = Math.round((unknown_apis * 100) / total_apis);
  return { messages, goal };
}

export async function getStatsMessage(team: string = '') {
  const ownership_data = await getOwnershipData();
  // If team is not mentioned return stats for all
  if (team === '') {
    const { messages, goal } = getOverallStats(
      new Map(Object.entries(ownership_data))
    );
    return {
      messages: messages,
      goal: goal,
      should_show_docs: true,
      review_link: OWNERSHIP_FILE_LINK,
    };
  }

  if (ownership_data[team] != null) {
    return getMessageForTeam(ownership_data, team);
  }

  return {
    messages: [INVALID_TEAM_ERROR],
    goal: -1,
    should_show_docs: false,
    review_link: OWNERSHIP_FILE_LINK,
  };
}
