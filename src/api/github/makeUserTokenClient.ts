import { EngPipesOctokit } from './engpipesOctokit';

export function makeUserTokenClient(token: string) {
  if (!token) {
    throw new Error('No token. Try setting GH_USER_TOKEN.');
  }
  return new EngPipesOctokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(
          `Request quota exhausted for request ${options.method} ${options.url}`
        );
      },
      onSecondaryRateLimit: (retryAfter, options, octokit) => {
        // does not retry, only logs a warning
        octokit.log.warn(
          `SecondaryRateLimit detected for request ${options.method} ${options.url}`
        );
      },
    },
  });
}
