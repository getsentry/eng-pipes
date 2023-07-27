import * as Sentry from '@sentry/node';

import { DAY_IN_MS, GH_USER_CLIENT } from '@/config';
import { isFromABot } from '@utils/isFromABot';

type UserType = 'bot' | 'internal' | 'external' | 'gtm';
type CachedUser = {
  type: UserType;
  expires: number;
};

const _USER_CACHE = new Map<string, CachedUser>();

/**
 * Given a GitHub username, get user type used for metrics
 */
export async function getOssUserType(
  payload: Record<string, any>
): Promise<UserType | null> {
  if (isFromABot(payload)) {
    return 'bot';
  }

  const { owner } = payload.repository;
  if (owner.type !== 'Organization') {
    return null;
  }

  const orgSlug = owner.login;
  const username = payload.sender.login;

  const cachedResult = _USER_CACHE.get(username);
  if (typeof cachedResult !== 'undefined') {
    // Check if expired
    if (Date.now() <= cachedResult.expires) {
      return cachedResult.type;
    }
  }

  async function getResponseStatus(func, args: any[]): Promise<number | null> {
    // Work around GitHub API goofiness.
    let out: number | null = null;
    const capture = (r) => {
      if (!r.status) {
        throw r; // bug in func :shrug:
      }
      out = r.status;
    };
    await func(...args)
      .then(capture)
      .catch(capture);
    return out;
  }

  let type: UserType | null = null;
  let status: number | null;
  let check: 'Org' | 'Team';

  // https://docs.github.com/en/rest/reference/orgs#check-organization-membership-for-a-user
  check = 'Org';
  status = await getResponseStatus(GH_USER_CLIENT.orgs.checkMembershipForUser, [
    { org: orgSlug, username },
  ]);

  if (status === 204) {
    // https://docs.github.com/en/rest/teams/members?apiVersion=2022-11-28#get-team-membership-for-a-user
    // "will include the members of child teams"

    check = 'Team';
    status = await getResponseStatus(GH_USER_CLIENT.request, [
      'GET /orgs/{orgSlug}/teams/GTM/memberships/{username}',
      { org: orgSlug, username },
    ]);
    if (status === 200) {
      // I'd rather express this inversely, so that the failure case is
      // slightly safer, but our GitHub teams are not clean enough for that.
      type = 'gtm';
    } else if (status === 404) {
      type = 'internal'; // ~= EPD
    }
  } else if (status === 404) {
    type = 'external';
  }

  if (type === null) {
    Sentry.captureException(
      new Error(
        `${check} membership check for ${username} failed with ${status}.`
      )
    );
  } else {
    const expires = Date.now() + DAY_IN_MS;
    _USER_CACHE.set(username, { type, expires });
  }

  return type;
}
