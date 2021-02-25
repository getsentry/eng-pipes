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
 * Return an Octokit client. If owner and repo are given, the client will be bound to that repo.
 */
export async function getClient(owner?: string, repo?: string) {
  if (!process.env.GH_APP_SECRET_KEY) {
    throw new Error('GH_APP_SECRET_KEY not defined');
  }
  if (!process.env.GH_APP_IDENTIFIER) {
    throw new Error('GH_APP_IDENTIFIER not defined');
  }

  const client = _getClient();
  if (owner && repo) {
    const installation = await client.apps.getRepoInstallation({ owner, repo });
    return _getClient(installation.data.id);
  } else {
    return client;
  }
}
