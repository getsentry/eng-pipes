import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

const _INSTALLATION_CACHE = new Map();

function _getClient(installationId?: number) {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      // Initialize GitHub App with id:private_key pair and generate JWT which is used for
      appId: Number(process.env.GH_APP_IDENTIFIER),
      privateKey: process.env.GH_APP_SECRET_KEY,
      installationId: 17395663,
    },
  });
}

/**
 * Return an Octokit client.
 *
 * Only org is required, as we can assume the GH App is installed org-wide.
 */
export async function getClient(org: string) {
  if (!process.env.GH_APP_SECRET_KEY) {
    throw new Error('GH_APP_SECRET_KEY not defined');
  }
  if (!process.env.GH_APP_IDENTIFIER) {
    throw new Error('GH_APP_IDENTIFIER not defined');
  }

  const appClient = _getClient();
  return appClient;

  // Cache the installation ID as it should never change
  if (_INSTALLATION_CACHE.has(org)) {
    return _getClient(_INSTALLATION_CACHE.get(org));
  }

  // Not sure if we can cache the octokit instance - installation tokens expire
  // after an hour, but octokit client may be able to handle this properly.
  const installation = await appClient.apps.getOrgInstallation({ org });
  _INSTALLATION_CACHE.set(org, installation.data.id);
  return _getClient(installation.data.id);
}
