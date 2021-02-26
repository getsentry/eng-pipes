import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

/**
 * get API client given an app installation id
 */
const getOctokitClient = (installationId?: number) =>
  new Octokit({
    authStrategy: createAppAuth,
    auth: {
      // Initialize GitHub App with id:private_key pair and generate JWT which is used for
      appId: Number(process.env.GH_APP_IDENTIFIER),
      privateKey: process.env.GH_APP_SECRET_KEY,
      installationId,
    },
  });

/**
 * Fetch an app installation instance given an owner and repo
 */
export async function getClient(owner: string, repo: string) {
  if (!process.env.GH_APP_SECRET_KEY) {
    throw new Error('GH_APP_SECRET_KEY not defined');
  }

  if (!process.env.GH_APP_IDENTIFIER) {
    throw new Error('GH_APP_IDENTIFIER not defined');
  }

  // Client for App (no installation id)
  const client = getOctokitClient();

  const result = await client.apps.getRepoInstallation({
    owner,
    repo,
  });

  const installationId = result.data.id;

  // Return client for the repo
  return getOctokitClient(installationId);
}
