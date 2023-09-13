import { Octokit } from '@octokit/rest';

function get_emoji_for_type(type, api_rate) {
  switch (type) {
    case "public":
      return api_rate == 0 ? ":sad_blob:" : api_rate < 20 ? ":blob-unamused:" : api_rate > 50 ? ":party-sunglasses-blob:" : "";
    case "private":
      return "";
    case "unknown": case "experimental":
      return api_rate == 0 ? ":party-sunglasses-blob:" : api_rate > 50 ? ":sad_blob:" : ":blob-unamused:";
  }
  return "";
}

function get_message_line_for_type(team_data, type, total) {
  const api_rate = Math.round(team_data[type].length* 100/total)
  const emoji = get_emoji_for_type(type, api_rate)
  return `• ${type}: ${team_data[type].length} (${api_rate}%) ${emoji} \n`
}

function get_message_for_team(ownership_data, team) {
  const team_data = ownership_data[team];
  const total = 
      team_data["public"].length + 
      team_data["private"].length + 
      team_data["experimental"].length + 
      team_data["unknown"].length; 
  return {
    message: `Publish status for ${team} APIs:\n` +
      get_message_line_for_type(team_data, 'public', total) + 
      get_message_line_for_type(team_data, 'private', total) +
      get_message_line_for_type(team_data, 'experimental', total) + 
      get_message_line_for_type(team_data, 'unknown', total),
    should_show_docs: team_data["unknown"].length + team_data["experimental"].length > 0
  }
}

export default async function getProgress(team: string) {
  const octokitWithToken = new Octokit({
    auth: process.env.GITHUB_PERSONAL_TOKEN,
  });  
  
  const resp = await octokitWithToken.rest.repos.getContent({
    owner: 'getsentry',
    repo: 'sentry',
    path: 'src/sentry/apidocs/api_ownership_stats_dont_modify.json',
  });

  if (!('content' in resp.data)) {
    throw new Error('content not in response');
  }
  if (!('encoding' in resp.data)) {
    throw new Error('encoding not in response');
  }
  if (resp.data.encoding !== 'base64') {
    throw new Error(`Unexpected content encoding: ${resp.data.encoding}`);
  }

  const buff = Buffer.from(resp.data.content, 'base64');
  const ownership_data = JSON.parse(buff.toString('ascii').trim());
  if (team == '') {
    // TODO: show data for all the teams
    return 'Under Construction';
  } 
  
  if (ownership_data.hasOwnProperty(team)) {
    return get_message_for_team(ownership_data, team).message;
  }
  
  return 'INVALID';
}
