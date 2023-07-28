import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
export const EngPipesOctokit = Octokit.plugin(retry, throttling);
