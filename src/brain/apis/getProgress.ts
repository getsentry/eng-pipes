import { Octokit } from '@octokit/rest';

export default async function getProgress() {
  const octokitWithToken = new Octokit({
    auth: process.env.GITHUB_PERSONAL_TOKEN,
  });
  const resp = await octokitWithToken.rest.repos.getContent({
    owner: 'getsentry',
    repo: 'sentry',
    path: 'prettier.config.js',
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
  return buff.toString('ascii').trim();
}
