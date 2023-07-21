import { GitHubOrgConfig } from '@/types';

// Don't use '@api' here, because it's ... not loaded yet, or something?
import { GitHubOrg } from '../api/github/org';

// Configs - loosely typed and ephemeral, used for collecting values found in
// the environment. We check for missing values using this but not for types,
// that is what GitHubOrg is for (below). Configs are stored by number taken
// from envvars. Roughly, `GH_APP_1_FOO=bar` becomes `{1: {FOO: "bar"}}`.

class GitHubOrgConfigs {
  configs: Map<number, any>;

  constructor() {
    this.configs = new Map<number, object>();
  }

  getOrCreate(num: number): GitHubOrgConfig | undefined {
    if (!this.configs.has(num)) {
      const config = { num: num };
      this.configs.set(num, config);
    }
    return this.configs.get(num);
  }
}

// Orgs - strongly typed and permanent, these are used throughout the codebase
// via `{ import GH_ORGS } from '@/config'`. They are accessed by org slug,
// usually taken from a GitHub event payload.

export class GitHubOrgs {
  orgs: Map<string, GitHubOrg>;

  constructor(orgConfigs) {
    this.orgs = new Map<string, GitHubOrg>();
    for (const config of orgConfigs.configs.values()) {
      this.orgs.set(config.slug, new GitHubOrg(config));
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
    // Soon we aim to support multiple orgs!
    const orgSlug = process.env.GETSENTRY_ORG || 'getsentry'; // ☢️
    if (!orgSlug) {
      throw new Error(
        `Could not find an org slug in ${JSON.stringify(gitHubEventPayload)}.`
      );
    }
    return this.get(orgSlug);
  }
}

// Loader - called in @/config to populate the GH_ORGS global.

export function loadGitHubOrgsFromEnvironment(env) {
  const configs = new GitHubOrgConfigs();
  let config;

  if (env.GH_APP_IDENTIFIER && env.GH_APP_SECRET_KEY) {
    // Collect config by (proleptic) envvar number. Once we have GH_APP_1_FOO
    // this will make more sense. We'll collect stuff in config and then
    // instantiate a GitHubOrg once all config has been collected for each
    // (once we've made a full pass through process.env).

    config = configs.getOrCreate(1);
    config.slug = process.env.GETSENTRY_ORG || 'getsentry'; // ☢️
    config.appAuth = {
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

  // Now convert them to (strongly-typed) orgs now that we know the info is
  // clean.
  return new GitHubOrgs(configs);
}
