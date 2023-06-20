import { createAppAuth } from '@octokit/auth-app';
import { retry } from '@octokit/plugin-retry';
import { Octokit } from '@octokit/rest';

import { GH_USER_TOKEN } from '@/config/index';

import { ClientType } from './clientType';

const _CLIENTS_BY_ORG = new Map();
const OctokitWithRetries = Octokit.plugin(retry);

interface AuthInfo {
  appId: number;
  privateKey: string;
  installationId?: number;
}

function _getUserClient() {
  return new OctokitWithRetries({
    auth: GH_USER_TOKEN,
  });
}

function _getAppClient(auth: AuthInfo) {
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
export async function getClient(type: ClientType, org: string | null) {
  if (process.env.FORCE_USER_TOKEN_GITHUB_CLIENT == 'true') {
    return _getUserClient();
  }

  if (type === ClientType.User) {
    if (!GH_USER_TOKEN) {
      throw new Error('GH_USER_TOKEN not defined');
    }

    return _getUserClient();
  } else {
    if (!process.env.GH_APP_SECRET_KEY) {
      throw new Error('GH_APP_SECRET_KEY not defined');
    }
    if (!process.env.GH_APP_IDENTIFIER) {
      throw new Error('GH_APP_IDENTIFIER not defined');
    }
    if (org == null) {
      throw new Error(
        'Must pass org to `getClient` if getting an app scoped client.'
      );
    }

    const auth: AuthInfo = {
      appId: Number(process.env.GH_APP_IDENTIFIER),
      privateKey: process.env.GH_APP_SECRET_KEY?.replace(/\\n/g, '\n'),
    };

    let client = _CLIENTS_BY_ORG.get(org);
    if (client === undefined) {
      // Bootstrap with a client not bound to an org.
      const appClient = _getAppClient(auth);

      // Use the unbound client to hydrate a client bound to an org.
      const installation = await appClient.apps.getOrgInstallation({ org });
      auth.installationId = installation.data.id;
      client = _getAppClient(auth);

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
