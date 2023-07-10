import { retry } from '@octokit/plugin-retry';
import { Octokit } from '@octokit/rest';
export const OctokitWithRetries = Octokit.plugin(retry);
