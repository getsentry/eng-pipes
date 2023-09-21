import getOwnershipData from './getOwnershipData';

export const OWNERSHIP_FILE_LINK =
  'https://github.com/getsentry/sentry/blob/master/src/sentry/apidocs/api_ownership_stats_dont_modify.json';
export const INVALID_TEAM_ERROR = 'INVALID_TEAM_ERROR';

const COLUMN_WIDTH = 21;
function getEmojiForType(
  type: string,
  api_rate: number,
  is_short_message: boolean
) {
  if (is_short_message) {
    switch (type) {
      case 'public':
        return api_rate < 10 ? '☒' : '';
      case 'private':
        return '';
      case 'unknown':
        return api_rate > 0 ? '☒' : '';
      case 'experimental':
        return api_rate > 0 ? '☒' : '';
    }
    return '';
  }

  switch (type) {
    case 'public':
      return api_rate == 0
        ? ':sad_blob:'
        : api_rate < 20
        ? ':blob-unamused:'
        : api_rate > 50
        ? ':party-sunglasses-blob:'
        : '';
    case 'private':
      return '';
    case 'unknown':
    case 'experimental':
      return api_rate == 0
        ? ':party-sunglasses-blob:'
        : api_rate > 50
        ? ':sad_blob:'
        : ':blob-unamused:';
  }
  return '';
}

function getShortMessageForType(team_data, type, total) {
  const api_rate = Math.round((team_data[type].length * 100) / total);
  const emoji = getEmojiForType(type, api_rate, true);
  const rate_string = strAdjustLength(api_rate.toString(), 3);
  return strAdjustLength(`${rate_string} ${emoji}`, type.length + 3);
}

function getMessageLineForType(team_data, type, total) {
  const api_rate = Math.round((team_data[type].length * 100) / total);
  const emoji = getEmojiForType(type, api_rate, false);
  return `• ${type}: ${team_data[type].length} (${api_rate}%) ${emoji} \n`;
}

function getTotalApisForTeam(team_data) {
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
    message:
      `Publish status for ${team} APIs:\n` +
      getMessageLineForType(team_data, 'public', total) +
      getMessageLineForType(team_data, 'private', total) +
      getMessageLineForType(team_data, 'experimental', total) +
      getMessageLineForType(team_data, 'unknown', total),
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
  let response =
    strAdjustLength('Team Name', COLUMN_WIDTH) +
    '| Public(%) | Private(%) | Experimental(%) | Unknown(%)\n';
  ownership_data.forEach((team_data, team) => {
    const total = getTotalApisForTeam(team_data);
    response =
      response +
      `<${OWNERSHIP_FILE_LINK}#L${team_data['block_start']}|${team}>` +
      strAdjustLength('', COLUMN_WIDTH - team.length) +
      '| ' +
      getShortMessageForType(team_data, 'public', total) +
      ' | ' +
      getShortMessageForType(team_data, 'private', total) +
      ' | ' +
      getShortMessageForType(team_data, 'experimental', total) +
      ' | ' +
      getShortMessageForType(team_data, 'unknown', total) +
      '\n';
  });
  return response;
}

export default async function getStatsMessage(team: string) {
  const ownership_data = await getOwnershipData();
  // If team is not mentioned return stats for all
  if (team == '') {
    return {
      message: getOverallStats(new Map(Object.entries(ownership_data))),
      should_show_docs: true,
      review_link: OWNERSHIP_FILE_LINK,
    };
  }

  if (ownership_data[team] != null) {
    return getMessageForTeam(ownership_data, team);
  }

  return {
    message: INVALID_TEAM_ERROR,
    should_show_docs: false,
    review_link: OWNERSHIP_FILE_LINK,
  };
}
