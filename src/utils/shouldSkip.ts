import { GitHubOrg } from '~/src/api/github/org';

export async function shouldSkip(payload, org: GitHubOrg, reasonsToSkip) {
  for (const skipIf of reasonsToSkip) {
    if (await skipIf(payload, org)) {
      return true;
    }
  }
  return false;
}
