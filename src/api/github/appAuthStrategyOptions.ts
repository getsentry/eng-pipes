// I didn't find something great in @octokit/types.

export interface AppAuthStrategyOptions {
  appId: number;
  privateKey: string;
  installationId?: number;
}
