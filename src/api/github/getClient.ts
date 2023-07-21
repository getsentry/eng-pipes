import { createAppAuth } from '@octokit/auth-app';

import { GETSENTRY_ORG } from '@/config/index';
import { GH_USER_TOKEN } from '@/config/index';
import { AppAuthStrategyOptions } from '@/types';

import { ClientType } from './clientType';
import { OctokitWithRetries } from './octokitWithRetries';

const _CLIENTS_BY_ORG = new Map();

function _getUserClient() {
  return new OctokitWithRetries({
    auth: GH_USER_TOKEN,
  });
}

function _getAppClient(auth: AppAuthStrategyOptions) {
  return new OctokitWithRetries({
    authStrategy: createAppAuth,
    auth,
  });
}

/**
 * Return an Octokit client.
 *
 * Only orgSlug is required, as we can assume the GH App is installed org-wide.
 */
export async function getClient(type: ClientType, orgSlug?: string | null) {
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

    const org = GETSENTRY_ORG;

    let client = _CLIENTS_BY_ORG.get(orgSlug);
    if (client === undefined) {
      // Bootstrap with a client not bound to an org.
      const appClient = _getAppClient(org.appAuth);

      // Use the unbound client to hydrate a client bound to an org.
      const installation = await appClient.apps.getOrgInstallation({
        org: orgSlug,
      });
      org.appAuth.installationId = installation.data.id;
      client = _getAppClient(org.appAuth);

      // The docs say it's safe for client instances to be long-lived:
      //
      // > Additionally, the SDK will take care of regenerating an installation
      // > access token for you so you don't need to worry about the one hour
      // > expiration.
      //
      // https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation#using-the-octokitjs-sdk-to-authenticate-as-an-app-installation

      _CLIENTS_BY_ORG.set(orgSlug, client);
    }
    return client;
  }
}
