import * as Sentry from '@sentry/node';

import { DAY_IN_MS } from '@/config';
import { Octokit } from '@octokit/rest';
import { isFromABot } from '@utils/isFromABot';
import { GH_RELEASE_BOT_TOKEN } from '@/config';

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
  const username = payload.sender.login;

  const cachedResult = _USER_CACHE.get(username);
  if (typeof cachedResult !== 'undefined') {
    // Check if expired
    if (Date.now() <= cachedResult.expires) {
      return cachedResult.type;
    }
  }

  const org_member_octokit = new Octokit({
    auth: GH_RELEASE_BOT_TOKEN,
  });
  let responseStatus: number | undefined;
  const capture = (r) => (responseStatus = r.status);
  await org_member_octokit.orgs
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
      const type = 'internal';
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
