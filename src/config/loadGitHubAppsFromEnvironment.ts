import { AppAuthStrategyOptions } from '@/types';

export function loadGitHubAppsFromEnvironment(env) {
  const apps = new Map<string, AppAuthStrategyOptions>();

  if (env.GH_APP_IDENTIFIER && env.GH_APP_SECRET_KEY) {
    apps.set('__tmp_org_placeholder__', {
      appId: Number(env.GH_APP_IDENTIFIER),
      privateKey: env.GH_APP_SECRET_KEY.replace(/\\n/g, '\n'),
    });
  }

  return apps;
}
