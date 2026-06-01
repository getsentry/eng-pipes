import { BigQuery } from '@google-cloud/bigquery';

import { GITHUB_USER_DIRECTORY_BQ, PROJECT } from '@/config';

const bigqueryClient = new BigQuery({ projectId: PROJECT });

export type GhDirectoryRow = {
  email: string;
  githubUsername: string;
};

/**
 * Reads the {email -> github_username} mapping that the security team's
 * update-github-directory cloud function publishes to BigQuery (SEC-1508).
 *
 * Returns one row per email. Rows missing either field are dropped — they
 * can't drive a Slack @-mention either way.
 *
 * The SELECT shape assumes a full snapshot per refresh. If SEC-1508 lands as
 * append-only with an `updated_at` column we'll switch to latest-per-email
 * via QUALIFY ROW_NUMBER() OVER (PARTITION BY email ORDER BY updated_at DESC).
 */
export async function fetchGithubUserDirectory(): Promise<GhDirectoryRow[]> {
  const { dataset, table } = GITHUB_USER_DIRECTORY_BQ;
  const query = `SELECT email, github_username FROM \`${dataset}.${table}\``;
  const [rows] = await bigqueryClient.query(query);
  return rows
    .filter((r: any) => r.email && r.github_username)
    .map((r: any) => ({
      email: r.email,
      githubUsername: r.github_username,
    }));
}
