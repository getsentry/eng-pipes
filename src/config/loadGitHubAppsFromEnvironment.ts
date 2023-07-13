import {
  AppAuthStrategyOptions,
  GitHubIssuesSomeoneElseCaresAbout,
} from '@/types';

export class GitHubApp {
  num: number;
  org: string;
  auth: AppAuthStrategyOptions;
  project: GitHubIssuesSomeoneElseCaresAbout;

  constructor(obj) {
    this.num = obj.num;
    this.org = obj.org;
    this.auth = obj.auth;
    this.project = obj.project;
  }
}

class GitHubAppsConfigHelper {
  configs: Map<number, any>; // much looser typing than apps

  constructor() {
    this.configs = new Map<number, object>();
  }

  forNumber(num: number): object | undefined {
    if (!this.configs.has(num)) {
      this.configs.set(num, { num: num });
    }
    return this.configs.get(num);
  }
}

export class GitHubAppsRegistry {
  apps: Map<string, GitHubApp>;

  constructor(configs) {
    this.apps = new Map<string, GitHubApp>();
    for (const config of configs.configs.values()) {
      this.apps.set(config.org, new GitHubApp(config));
    }
  }

  load(org) {
    const app = this.apps.get(org);
    if (app === undefined) {
      throw new Error(`No app is registered for '${org}'.`);
    }
    return app;
  }

  // API for payload (JSON struct coming from GitHub)

  loadFromPayload(payload) {
    // Soon we aim to support multiple orgs!
    const org = '__tmp_org_placeholder__'; // payload?.organization?.login;
    if (!org) {
      throw new Error(`Could not find an org in ${JSON.stringify(payload)}.`);
    }
    return this.load(org);
  }
}

export function loadGitHubAppsFromEnvironment(env) {
  const configs = new GitHubAppsConfigHelper();
  let config;

  if (env.GH_APP_IDENTIFIER && env.GH_APP_SECRET_KEY) {
    // Collect config by (proleptic) envvar number. Once we have GH_APP_1_FOO
    // this will make more sense. We'll collect stuff in config and then
    // instantiate a GitHubApp once all config has been collected for each
    // (once we've made a full pass through process.env).

    config = configs.forNumber(1);
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
  return new GitHubAppsRegistry(configs);
}
