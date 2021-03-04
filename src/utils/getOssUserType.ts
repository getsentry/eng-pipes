import * as Sentry from '@sentry/node';

import { getClient } from '@api/github/getClient';

const _USER_CACHE = new Map();

const KNOWN_BOTS = [
  // https://www.notion.so/sentry/Bot-Accounts-beea0fc35473453ab50e05e6e4d1d02d
  'getsentry-bot',
  'getsentry-release',
  'sentry-test-fixture-nonmember',
];
/**
 * Given a GitHub username, get user type used for metrics
 */
export async function getOssUserType(payload: Record<string, any>) {
  if (
    KNOWN_BOTS.includes(payload.sender.login) ||
    payload.sender.login.endsWith('[bot]')
  ) {
    return 'bot';
  }

  const { owner } = payload.repository;
  if (owner.type !== 'Organization') {
    return null;
  }

  // NB: Try to keep this check in sync with getsentry/.github/.../validate-new-issue.yml.
  const org = owner.login;
  const octokit = await getClient(org);
  const username = payload.sender.login;

  const cachedResult = _USER_CACHE.get(username);
  if (typeof cachedResult !== 'undefined') {
    return cachedResult;
  }

  let responseStatus;
  const capture = (r) => (responseStatus = r.status);
  await octokit.orgs
    .checkMembershipForUser({
      org,
      username: payload.sender.login,
    })
    .then(capture)
    .catch(capture);

  // https://docs.github.com/en/rest/reference/orgs#check-organization-membership-for-a-user
  switch (responseStatus as number) {
    case 204: {
      const userType = 'internal';
      _USER_CACHE.set(username, userType);
      return userType;
    }
    case 404: {
      const userType = 'external';
      _USER_CACHE.set(username, userType);
      return userType;
    }
    default: {
      Sentry.captureException(
        new Error(`Org membership check failing with ${responseStatus}`)
      );
      return null;
    }
  }
}
