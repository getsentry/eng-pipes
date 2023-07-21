import { createAppAuth } from '@octokit/auth-app';

import { GH_ORGS } from '@/config/index';
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
 * Only org is required, as we can assume the GH App is installed org-wide.
 */
export async function getClient(type: ClientType, org?: string | null) {
  if (process.env.FORCE_USER_TOKEN_GITHUB_CLIENT == 'true') {
    return _getUserClient();
  }

  if (type === ClientType.User) {
    if (!GH_USER_TOKEN) {
      throw new Error('GH_USER_TOKEN not defined');
    }
    return _getUserClient();
  } else {
    if (org == null) {
      throw new Error(
        'Must pass org to `getClient` if getting an app scoped client.'
      );
    }

    const app = GH_ORGS.get('__tmp_org_placeholder__');

    let client = _CLIENTS_BY_ORG.get(org);
    if (client === undefined) {
      // Bootstrap with a client not bound to an org.
      const appClient = _getAppClient(app.auth);

      // Use the unbound client to hydrate a client bound to an org.
      const installation = await appClient.apps.getOrgInstallation({ org });
      app.auth.installationId = installation.data.id;
      client = _getAppClient(app.auth);

      // The docs say it's safe for client instances to be long-lived:
      //
      // > Additionally, the SDK will take care of regenerating an installation
      // > access token for you so you don't need to worry about the one hour
      // > expiration.
      //
      // https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation#using-the-octokitjs-sdk-to-authenticate-as-an-app-installation

      _CLIENTS_BY_ORG.set(org, client);
    }
    return client;
  }
}
