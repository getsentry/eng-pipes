import * as Sentry from '@sentry/node';

import { ClientType } from '@/api/github/clientType';
import { DAY_IN_MS } from '@/config';
import { getClient } from '@api/github/getClient';
import { isFromABot } from '@utils/isFromABot';

type UserType = 'bot' | 'internal' | 'external';
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

  // NB: Try to keep this check in sync with getsentry/.github/.../validate-new-issue.yml.
  const org = owner.login;
  const octokit = await getClient(ClientType.User, org);
  const username = payload.sender.login;

  const cachedResult = _USER_CACHE.get(username);
  if (typeof cachedResult !== 'undefined') {
    // Check if expired
    if (Date.now() <= cachedResult.expires) {
      return cachedResult.type;
    }
  }

  let responseStatus: number | undefined;
  const capture = (r) => (responseStatus = r.status);
  await octokit.orgs
    .checkMembershipForUser({
      org,
      username: payload.sender.login,
    })
    .then(capture)
    .catch(capture);

  const expires = Date.now() + DAY_IN_MS;

  // https://docs.github.com/en/rest/reference/orgs#check-organization-membership-for-a-user
  switch (responseStatus as number) {
    case 204: {
      if () {
        const type = 'internal';
      } else {
        const type = 'gtm';
        // https://docs.github.com/en/rest/teams/members?apiVersion=2022-11-28#get-team-membership-for-a-user
        // "will include the members of child teams."
        
        // /orgs/{org}/teams/{team_slug}/memberships/{username}
      }
      _USER_CACHE.set(username, { type, expires });
      return type;
    }
    case 404: {
      const type = 'external';
      _USER_CACHE.set(username, { type, expires });
      return type;
    }
    default: {
      Sentry.captureException(
        new Error(`Org membership check failing with ${responseStatus}`)
      );
      return null;
    }
  }
}
