import { BigQuery } from '@google-cloud/bigquery';

const PROJECT = 'super-big-data';
const bigqueryClient = new BigQuery({ projectId: PROJECT });

function objectToSchema(obj: Record<string, any>) {
  return Object.entries(obj).map(([name, type]) => ({
    name,
    type,
  }));
}

// Configuration based on a target type
const TARGETS = {
  oss: {
    dataset: 'open_source',
    table: 'github_events',
    schema: {
      type: 'STRING',
      action: 'STRING',
      username: 'STRING',
      user_id: 'INT64',
      repository: 'STRING',
      object_id: 'INT64',
      created_at: 'TIMESTAMP',
      updated_at: 'TIMESTAMP',
      target_id: 'INT64',
      target_name: 'STRING',
      target_type: 'STRING',
    },
  },
  product: {
    dataset: 'product_eng',
    table: 'development_metrics',
    schema: {
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
    },
  },
};

type TargetConfig = {
  dataset: string;
  table: string;
  schema: Record<string, string>;
};

function _insert(data: Record<string, any>, targetConfig: TargetConfig) {
  const dataset = bigqueryClient.dataset(targetConfig.dataset);
  const table = dataset.table(targetConfig.table);

  return table.insert(data, {
    schema: objectToSchema(targetConfig.schema),
  });
}

export async function insert({ meta = {}, ...row }) {
  return _insert({ ...row, meta: JSON.stringify(meta) }, TARGETS.product);
}

export async function insertOss(
  eventType: string,
  payload: Record<string, any>
) {
  const data: Record<string, any> = {
    type: eventType,
    action: payload.action,
    username: payload.sender.login,
    user_id: payload.sender.id,
    repository: payload.repository.full_name,
  };

  if (eventType === 'issues') {
    const { issue } = payload;

    data.object_id = issue.number;
    data.created_at = issue.created_at;
    data.updated_at = issue.updated_at;
  } else if (eventType === 'issue_comment') {
    const { comment, issue } = payload;

    data.object_id = comment.id;
    data.created_at = comment.created_at;
    data.updated_at = comment.updated_at;
    data.target_id = issue.number;
    data.target_type = 'issue';
  } else if (eventType === 'pull_request') {
    const {
      action,
      pull_request,
      requested_reviewer,
      requested_team,
    } = payload;

    data.object_id = pull_request.number;
    data.created_at = pull_request.created_at;
    data.updated_at = pull_request.updated_at;

    if (pull_request.merged) {
      data.action = 'merged';
    }

    if (action === 'review_requested') {
      if (requested_reviewer) {
        data.target_id = requested_reviewer.id;
        data.target_name = requested_reviewer.login;
        data.target_type = 'user';
      } else if (requested_team) {
        data.target_id = requested_team.id;
        data.target_name = requested_team.name;
        data.target_type = 'team';
      }
    }
  } else if (eventType === 'pull_request_review') {
    const { review, pull_request } = payload;

    data.object_id = review.id;
    data.created_at = review.submitted_at;
    data.updated_at = pull_request.updated_at;
    data.target_id = pull_request.number;
    data.target_name = review.state;
    data.target_type = 'pull_request';
  } else {
    // Unknown payload event, ignoring...
    return {};
  }

  if (process.env.DRY_RUN) {
    const targetConfig = TARGETS.oss;
    console.log(`
###### Dry Run: BigQuery Insert ######
  Dataset: ${targetConfig.dataset}
  Table: ${targetConfig.table}
  Schema: ${objectToSchema(targetConfig.schema)}
  Data: ${data}
######################################`);
    return;
  }

  return _insert(data, TARGETS.oss);
}

export async function mapDeployToPullRequest(
  deploy_id: number,
  pull_request_number: number,
  commit_sha: string
) {
  const schema = {
    deploy_id: 'integer',
    pull_request_number: 'integer',
    commit_sha: 'string',
  };

  return _insert(
    {
      deploy_id,
      pull_request_number,
      commit_sha,
    },
    {
      ...TARGETS.product,
      schema,
    }
  );
}
