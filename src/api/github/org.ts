import {
  AppAuthStrategyOptions,
  GitHubIssuesSomeoneElseCaresAbout,
  GitHubOrgConfig,
} from '@/types';

export class GitHubOrg {
  slug: string;
  appAuth: AppAuthStrategyOptions;
  project: GitHubIssuesSomeoneElseCaresAbout;

  constructor(config: GitHubOrgConfig) {
    this.slug = config.slug;
    this.appAuth = config.appAuth;
    this.project = config.project;
  }
}
