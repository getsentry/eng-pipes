import { AppAuthStrategyOptions } from '@/types';

export class GitHubApp {
  org: string;
  auth: AppAuthStrategyOptions;
  project;

  constructor(org: string, opts) {
    this.org = org;
    this.auth = {
      appId: Number(opts.GH_APP_IDENTIFIER),
      privateKey: opts.GH_APP_SECRET_KEY.replace(/\\n/g, '\n'),
    };
    this.project = {
      node_id: opts.ISSUES_PROJECT_NODE_ID || 'PVT_kwDOABVQ184AOGW8',
      product_area_field_id:
        opts.PRODUCT_AREA_FIELD_ID || 'PVTSSF_lADOABVQ184AOGW8zgJEBno',
      status_field_id: opts.STATUS_FIELD_ID || 'PVTSSF_lADOABVQ184AOGW8zgI_7g0',
      response_due_date_field_id:
        opts.RESPONSE_DUE_DATE_FIELD_ID || 'PVTF_lADOABVQ184AOGW8zgLLxGg',
    };
  }
}

export class GitHubAppsRegistry {
  apps: Map<string, GitHubApp>;

  constructor() {
    this.apps = new Map<string, GitHubApp>();
  }

  register(app) {
    this.apps.set(app.org, app);
  }

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

  if (env.GH_APP_IDENTIFIER && env.GH_APP_SECRET_KEY) {
    const org = '__tmp_org_placeholder__';
    apps.register(new GitHubApp(org, env));
  }

  return apps;
}
