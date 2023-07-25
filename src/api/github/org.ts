import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

import {
  AppAuthStrategyOptions,
  GitHubIssuesSomeoneElseCaresAbout,
  GitHubOrgConfig,
} from '@/types';

import { OctokitWithRetries } from './octokitWithRetries';

export class GitHubOrg {
  slug: string;
  appAuth: AppAuthStrategyOptions;
  project: GitHubIssuesSomeoneElseCaresAbout;
  api: Octokit;

  constructor(config: GitHubOrgConfig) {
    this.slug = config.slug;
    this.appAuth = config.appAuth;
    this.project = config.project;

    // Call bindAPI ASAP. We can't call it here because constructors can't be
    // async.
    this.api = new OctokitWithRetries({
      authStrategy: createAppAuth,
      auth: this.appAuth, // unbound, good enough for now
    });
  }

  async bindAPI() {
    // Use an Octokit not bound to an org to make an Octokit bound to our org.
    // The docs say it's safe for Octokit instances to be long-lived:
    //
    // > Additionally, the SDK will take care of regenerating an installation
    // > access token for you so you don't need to worry about the one hour
    // > expiration.
    //
    // https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation#using-the-octokitjs-sdk-to-authenticate-as-an-app-installation
    if (this.appAuth.installationId === undefined) {
      const installation = await this.api.apps.getOrgInstallation({
        org: this.slug,
      });
      this.appAuth.installationId = installation.data.id;
      this.api = new OctokitWithRetries({
        authStrategy: createAppAuth,
        auth: this.appAuth,
      });
    }
  }
}
