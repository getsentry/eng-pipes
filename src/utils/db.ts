import { BigQuery } from '@google-cloud/bigquery';

const DATASET = 'product_eng';
const PROJECT = 'super-big-data';

const bigqueryClient = new BigQuery({ projectId: PROJECT });

const schema = {
  /**
   * This represents an id that can be used across services
   */
  object_id: 'integer',

  /**
   * id used on current service
   */
  source_id: 'integer',

  /**
   * A parent reference
   */
  parent_id: 'integer',

  /**
   * started, passed, failed?
   */
  event: 'string',

  /**
   * service name, e.g. travis
   */
  source: 'string',

  /**
   * start timestamp for the event
   */
  start_timestamp: 'timestamp',

  /**
   * end timestamp for the event
   */
  end_timestamp: 'timestamp',

  /**
   * Other data in JSON
   */
  meta: 'string',
};

export async function insert({ meta = {}, ...row }) {
  const dataset = bigqueryClient.dataset(DATASET);
  const table = dataset.table('development_metrics');

  return table.insert(
    { ...row, meta: JSON.stringify(meta) },
    {
      schema: Object.entries(schema)
        .map(entry => entry.join(':'))
        .join(','),
    }
  );
}

export async function mapDeployToPullRequest(
  deploy_id,
  pull_request_number,
  commit_sha
) {
  const dataset = bigqueryClient.dataset(DATASET);
  const table = dataset.table('freight_to_pull_request');
  console.log(deploy_id, pull_request_number, commit_sha);
  return table.insert(
    {
      deploy_id,
      pull_request_number,
      commit_sha,
    },
    {
      schema: {
        deploy_id: 'integer',
        pull_request_number: 'integer',
        commit_sha: 'string',
      },
    }
  );
}
