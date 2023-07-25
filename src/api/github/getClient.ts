import { GETSENTRY_ORG } from '@/config/index';
import { GH_USER_TOKEN } from '@/config/index';

import { ClientType } from './clientType';
import { OctokitWithRetries } from './octokitWithRetries';

function _getUserClient() {
  return new OctokitWithRetries({
    auth: GH_USER_TOKEN,
  });
}

export function getClient(type: ClientType, orgSlug?: string | null) {
  if (process.env.FORCE_USER_TOKEN_GITHUB_CLIENT == 'true') {
    return _getUserClient();
  }

  if (type === ClientType.User) {
    if (!GH_USER_TOKEN) {
      throw new Error('GH_USER_TOKEN not defined');
    }
    return _getUserClient();
  } else {
    if (orgSlug == null) {
      throw new Error(
        'Must pass orgSlug to `getClient` if getting an app scoped client.'
      );
    }
    return GETSENTRY_ORG.api; // ☢️
  }
}
