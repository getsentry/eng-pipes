import {
  AppAuthStrategyOptions,
  GitHubIssuesSomeoneElseCaresAbout,
} from '@/types';

// Config - loosely typed and ephemeral, used for collecting values found in
// the environment. We check for missing values using this but not for types,
// that is what GitHubApp is for (below). Configs are stored by number taken
// from envvars. Roughly, `GH_APP_1_FOO=bar` becomes `{1: {FOO: "bar"}}`.

class GitHubAppConfig {
  num: any;
  org: any;
  auth: any;
  project: any;
}

class GitHubAppConfigs {
  configs: Map<number, any>;

  constructor() {
    this.configs = new Map<number, object>();
  }

  getOrCreate(num: number): object {
    if (!this.configs.has(num)) {
      const config = new GitHubAppConfig();
      config.num = num;
      this.configs.set(num, config);
    }
    return this.configs.get(num);
  }

  validateAll() {
    const allErrors = new Object();
    for (const [n, config] of this.configs) {
      const errors = new Array();
      [
        'auth.appId',
        'auth.privateKey',
        'project.node_id',
        'project.product_area_field_id',
        'project.status_field_id',
        'project.response_due_date_field_id',
      ].forEach((group_key) => {
        const [group, key] = group_key.split('.');
        if (!config[group][key]) {
          errors.push(`${group}.${key}`);
        }
      });

      if (errors.length) {
        allErrors[n] = errors;
      }
    }
    if (Object.keys(allErrors).length) {
      throw new Error(`Config missing: ${JSON.stringify(allErrors)}`);
    }
  }
}

// App - strongly typed and permanent, these are used throughout the codebase
// via `{ import GH_APPS } from '/@config'`. They are accessed by org slug,
// usually taken from a GitHub event payload.

export class GitHubApp {
  num: number;
  org: string;
  auth: AppAuthStrategyOptions;
  project: GitHubIssuesSomeoneElseCaresAbout;

  constructor(config) {
    this.num = config.num;
    this.org = config.org;
    this.auth = config.auth;
    this.project = config.project;
  }
}

export class GitHubApps {
  apps: Map<string, GitHubApp>;

  constructor(appConfigs) {
    this.apps = new Map<string, GitHubApp>();
    for (const config of appConfigs.configs.values()) {
      this.apps.set(config.org, new GitHubApp(config));
    }
  }

  get(org) {
    const app = this.apps.get(org);
    if (app === undefined) {
      throw new Error(`No app is registered for '${org}'.`);
    }
    return app;
  }

  getForPayload(gitHubEventPayload) {
    // Org slug is differently accessed in org-scoped APIs vs. repo-scoped APIs
    let org: string;
    if (gitHubEventPayload.organization) {
      org = gitHubEventPayload.organization.login;
    } else if (gitHubEventPayload.repository?.owner?.type === 'Organization') {
      org = gitHubEventPayload.repository.owner.login;
    } else {
      throw new Error(
        `Could not find an org in '${JSON.stringify(
          gitHubEventPayload.organization
        )}' or '${JSON.stringify(gitHubEventPayload.repository?.owner)}'.`
      );
    }
    return this.get(org);
  }
}

// Loader - called in @/config to populate the GH_APPS global.

export function loadGitHubAppsFromEnvironment(env) {
  const configs = new GitHubAppConfigs();

  for (const [envvar, value] of Object.entries(env)) {
    // Find app configuration in env, grouping by number (GH_APP_1_FOO).

    const m = envvar.match(/^GH_APP_(\d+)_([A-Z_]+)$/);
    if (m === null) {
      continue;
    }

    const n = parseInt(m[1], 10);
    const noop = (x) => x;
    const path_mod = new Map([
      ['ORG_SLUG', ['org', noop]],
      ['IDENTIFIER', ['auth.appId', (x) => Number(x)]],
      ['SECRET_KEY', ['auth.privateKey', (x) => x.replace(/\\n/g, '\n')]],
      ['ISSUES_PROJECT_NODE_ID', ['project.node_id', noop]],
      ['PRODUCT_AREA_FIELD_ID', ['project.product_area_field_id', noop]],
      ['STATUS_FIELD_ID', ['project.status_field_id', noop]],
      [
        'RESPONSE_DUE_DATE_FIELD_ID',
        ['project.response_due_date_field_id', noop],
      ],
    ]).get(m[2]);

    if (path_mod === undefined) {
      continue;
    }

    const path = path_mod[0] as string;
    const mod = path_mod[1] as (x: any) => any;
    const [first, second] = path.split('.');

    const config = configs.getOrCreate(n);
    if (second) {
      config[first][second] = mod(value);
    } else {
      config[first] = mod(value);
    }
  }

  // Once all configs are in hand, validate them once so we can see all errors
  // at once (vs. config whack-a-mole).
  configs.validateAll();

  // Convert configs to (strongly-typed) apps now that we know all values are
  // present.
  return new GitHubApps(configs);
}
