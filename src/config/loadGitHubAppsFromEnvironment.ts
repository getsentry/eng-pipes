import { AppAuthStrategyOptions } from '@/types';

interface ProjectOptions {
  node_id: string;
  product_area_field_id: string;
  status_field_id: string;
  response_due_date_field_id: string;
}

export class GitHubApp {
  num: number;
  org: string;
  auth: AppAuthStrategyOptions;
  project: ProjectOptions;

  constructor(obj) {
    this.num = obj.num;
    this.org = obj.org;
    this.auth = obj.auth;
    this.project = obj.project;
  }
}

export class GitHubAppsRegistry {
  constructor() {
    this.apps = new Map<string, GitHubApp>();
    this.configs = new Map<number, object>();
  }

  validate() {
    const allErrors = new Object();
    for (const [org, app] of this.apps) {
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
        if (!app[group][key]) {
          errors.push(`${group}.${key}.`);
        }
      });
      if (errors.length) {
        allErrors[org] = errors;
      }
    }
    if (Object.keys(allErrors).length) {
      throw new Error(`Config missing: ${JSON.stringify(allErrors)}`);
    }
    delete this.configs; // ¯\_(ツ)_/¯
  }

  // API for number (from envvars, e.g. GH_APP_1_FOO)

  configs?: Map<number, object>;

  configForNumber(num: number): object | undefined {
    if (!this.configs?.has(num)) {
      this.configs?.set(num, { num: num });
    }
    return this.configs?.get(num);
  }

  // API for org slug

  apps: Map<string, GitHubApp>;

  pop(org) {
    const app = this.load(org);
    this.apps.delete(org);
    return app;
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
  const apps = new GitHubAppsRegistry();
  let config;

  if (env.GH_APP_IDENTIFIER && env.GH_APP_SECRET_KEY) {
    // Collect config by (proleptic) envvar number. Once we have GH_APP_1_FOO
    // this will make more sense. We'll collect shtuff in config and then
    // instantiate a GitHubApp once all config has been collected for each
    // (once we've made a full pass through process.env).

    config = apps.configForNumber(1);
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

    // File it by org slug since that's how we'll reference it from now on.

    apps.apps.set(config.org, new GitHubApp(config));
  }

  // Once all apps are loaded, validate them once so we can see all errors at
  // once (vs. config whack-a-mole).

  apps.validate();
  return apps;
}
