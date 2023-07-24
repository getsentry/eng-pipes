import fs from 'fs';

import yaml from 'js-yaml';

// Don't use '@api' here, because it's ... not loaded yet, or something?
import { GitHubOrg } from '../api/github/org';
import { GitHubOrgConfig } from '../types';

// Orgs are used throughout the codebase via `{ import GH_ORGS } from
// '@/config'`. They are accessed by org slug, often taken from a GitHub event
// payload.

export class GitHubOrgs {
  orgs: Map<string, GitHubOrg>;

  constructor(orgConfigs) {
    this.orgs = new Map<string, GitHubOrg>();
    for (const [orgSlug, config] of Object.entries(orgConfigs)) {
      this.orgs.set(orgSlug, new GitHubOrg(orgSlug, config as GitHubOrgConfig));
    }
  }

  get(orgSlug) {
    const org = this.orgs.get(orgSlug);
    if (org === undefined) {
      throw new Error(`No org is registered for '${orgSlug}'.`);
    }
    return org;
  }

  getForPayload(gitHubEventPayload) {
    // Org slug is differently accessed in org-scoped APIs vs. repo-scoped APIs.
    let orgSlug: string;
    if (gitHubEventPayload.organization?.login) {
      orgSlug = gitHubEventPayload.organization.login;
    } else if (
      gitHubEventPayload.repository?.owner?.login &&
      gitHubEventPayload.repository?.owner?.type === 'Organization'
    ) {
      orgSlug = gitHubEventPayload.repository.owner.login;
    } else {
      throw new Error(
        `Could not find an org in '${JSON.stringify(
          gitHubEventPayload.organization,
          null,
          2
        )}' or '${JSON.stringify(
          gitHubEventPayload.repository?.owner,
          null,
          2
        )}'.`
      );
    }
    return this.get(orgSlug);
  }
}

// Loader - called in @/config to populate the GH_ORGS global.

export function loadGitHubOrgs(env) {
  let configs = {};
  const filepath = env.GH_ORGS_YML || 'github-orgs.yml';
  if (filepath) {
    configs = yaml.load(fs.readFileSync(filepath));
  }

  // Do a little in-place cleanup.
  for (const _config of Object.values(configs)) {
    const config = _config as GitHubOrgConfig;

    // IDs
    for (const idVar of ['appId', 'installationId']) {
      const tmp = parseInt(config.appAuth[idVar], 10);
      if (Number.isNaN(tmp)) {
        throw `${idVar} '${config.appAuth[idVar]}' is not a number`;
      }
      config.appAuth[idVar] = tmp;
    }

    // Key
    const keyEnvVarName = config.appAuth.privateKey;
    const keyFromEnv = env[keyEnvVarName];
    let key;
    if (keyFromEnv) {
      key = keyFromEnv.replace(/\\n/g, '\n');
    } else {
      key = `No key found in '${keyEnvVarName}'`;
    }
    config.appAuth.privateKey = key;
  }

  return new GitHubOrgs(configs);
}
