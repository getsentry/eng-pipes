import { GETSENTRY_ORG } from '@/config';

const OWNERSHIP_FILE_PATH = 'api_ownership_stats_dont_modify.json';
const SENTRY_API_SCHEMA = 'sentry-api-schema';

export default async function getOwnershipData() {
  const resp = await GETSENTRY_ORG.api.rest.repos.getContent({
    owner: GETSENTRY_ORG.slug,
    repo: SENTRY_API_SCHEMA,
    path: OWNERSHIP_FILE_PATH,
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
  return JSON.parse(buff.toString('ascii'));
}
