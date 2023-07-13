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

  getOrCreate(num: number): object | undefined {
    if (!this.configs.has(num)) {
      const config = new GitHubAppConfig();
      config.num = num;
      this.configs.set(num, config);
    }
    return this.configs.get(num);
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
    // Soon we aim to support multiple orgs!
    const org = '__tmp_org_placeholder__'; // payload?.organization?.login;
    if (!org) {
      throw new Error(
        `Could not find an org in ${JSON.stringify(gitHubEventPayload)}.`
      );
    }
    return this.get(org);
  }
}

// Loader - called in @/config to populate the GH_APPS global.

export function loadGitHubAppsFromEnvironment(env) {
  const configs = new GitHubAppConfigs();
  let config;

  if (env.GH_APP_IDENTIFIER && env.GH_APP_SECRET_KEY) {
    // Collect config by (proleptic) envvar number. Once we have GH_APP_1_FOO
    // this will make more sense. We'll collect stuff in config and then
    // instantiate a GitHubApp once all config has been collected for each
    // (once we've made a full pass through process.env).

    config = configs.getOrCreate(1);
    config.org = '__tmp_org_placeholder__';
    config.auth = {
      appId: Number(env.GH_APP_IDENTIFIER),
      privateKey: env.GH_APP_SECRET_KEY.replace(/\\n/g, '\n'),
    };
    config.project = {
      node_id: env.ISSUES_PROJECT_NODE_ID || 'PVT_kwDOABVQ184AOGW8',
      product_area_field_id:
        env.PRODUCT_AREA_FIELD_ID || 'PVTSSF_lADOABVQ184AOGW8zgJEBno',
      status_field_id: env.STATUS_FIELD_ID || 'PVTSSF_lADOABVQ184AOGW8zgI_7g0',
      response_due_date_field_id:
        env.RESPONSE_DUE_DATE_FIELD_ID || 'PVTF_lADOABVQ184AOGW8zgLLxGg',
    };
  }

  // Now convert them to (strongly-typed) apps now that we know the info is
  // clean.
  return new GitHubApps(configs);
}
