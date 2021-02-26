import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

function _getClient(installationId?: number) {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      // Initialize GitHub App with id:private_key pair and generate JWT which is used for
      appId: Number(process.env.GH_APP_IDENTIFIER),
      privateKey: process.env.GH_APP_SECRET_KEY,
      installationId,
    },
  });
}

/**
 * Return an Octokit client. Owner is required. If repo is given, the client
 * will use installation auth bound to the repo, otherwise owner is assumed to
 * be an org and the client will use installation auth bound to the org.
 */
export async function getClient(owner: string, repo?: string) {
  if (!process.env.GH_APP_SECRET_KEY) {
    throw new Error('GH_APP_SECRET_KEY not defined');
  }
  if (!process.env.GH_APP_IDENTIFIER) {
    throw new Error('GH_APP_IDENTIFIER not defined');
  }

  const client = _getClient();
  let installation;
  if (repo) {
    installation = await client.apps.getRepoInstallation({ owner, repo });
  } else {
    installation = await client.apps.getOrgInstallation({ org: owner });
  }
  return _getClient(installation.data.id);
}
