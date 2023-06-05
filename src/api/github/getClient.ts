import { createAppAuth } from '@octokit/auth-app';
import { retry } from '@octokit/plugin-retry';
import { Octokit } from '@octokit/rest';

import { GH_USER_TOKEN } from '@/config/index';

import { ClientType } from './clientType';

const _INSTALLATION_CACHE = new Map();

function _getAppClient(installationId?: number) {
  const OctokitWithRetries = Octokit.plugin(retry);

  const auth = {
    // Initialize GitHub App with id:private_key pair and generate JWT which is used for
    appId: Number(process.env.GH_APP_IDENTIFIER),
    privateKey: process.env.GH_APP_SECRET_KEY?.replace(/\\n/g, '\n'),

    // We are doing this convoluted spread because `createAppAuth` will throw if
    // `installationId` is a key in `auth` object. Functionally, nothing
    // changes, but now throws if `installationId` is undefined (and present in
    // `auth` object)
    ...(installationId ? { installationId } : {}),
  };

  return new OctokitWithRetries({
    authStrategy: createAppAuth,
    auth,
  });
}

function _getUserClient() {
  const OctokitWithRetries = Octokit.plugin(retry);

  return new OctokitWithRetries({
    auth: GH_USER_TOKEN,
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

    const appClient = _getAppClient();

    // Cache the installation ID as it should never change
    if (_INSTALLATION_CACHE.has(org)) {
      return _getAppClient(_INSTALLATION_CACHE.get(org));
    }

    // Not sure if we can cache the octokit instance - installation tokens expire
    // after an hour, but octokit client may be able to handle this properly.
    const installation = await appClient.apps.getOrgInstallation({ org });
    _INSTALLATION_CACHE.set(org, installation.data.id);
    return _getAppClient(installation.data.id);
  }
}
