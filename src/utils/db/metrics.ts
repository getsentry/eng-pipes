import { BigQuery } from '@google-cloud/bigquery';
import * as Sentry from '@sentry/node';

import { DRY_RUN, PRODUCT_AREA_LABEL_PREFIX, PROJECT } from '@/config';

import { getOssUserType } from '../github/getOssUserType';
import { getTeams } from '../github/getTeams';
import {
  calculateSLOViolationRoute,
  calculateSLOViolationTriage,
} from '../misc/businessHours';

const bigqueryClient = new BigQuery({ projectId: PROJECT });

function objectToSchema(obj: Record<string, any>) {
  return Object.entries(obj).map(([name, type]) => ({
    name,
    type,
  }));
}

// Configuration based on a target type
export const TARGETS = {
  oss: {
    dataset: 'open_source',
    table: 'github_events',
    schema: {
      type: 'STRING',
      action: 'STRING',
      username: 'STRING',
      user_id: 'INT64',
      user_type: 'STRING',
      repository: 'STRING',
      object_id: 'INT64',
      created_at: 'TIMESTAMP',
      updated_at: 'TIMESTAMP',
      target_id: 'INT64',
      target_name: 'STRING',
      target_type: 'STRING',
      timeToRouteBy: 'TIMESTAMP',
      timeToTriageBy: 'TIMESTAMP',
      product_area: 'STRING',
      teams: 'STRING',
    },
  },

  assetSize: {
    dataset: 'product_eng',
    table: 'asset_sizes',
    schema: {
      /**
       * This represents an id that can be used across services
       */
      pull_request_number: 'integer',

      commit: 'string',

      file: 'string',

      entrypointName: 'string',

      /**
       * Asset file size
       */
      size: 'integer',

      environment: 'string',

      node_env: 'string',

      /**
       * start timestamp for the event
       */
      created_at: 'timestamp',
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

      /**
       * the git revision for the event
       */
      sha: 'string',
    },
  },

  brokenBuilds: {
    dataset: 'product_eng',
    table: 'broken_builds',
    schema: {
      /**
       * unique id to identify the build
       */
      build_id: 'string',

      /**
       * the repository where the build was broken
       */
      repo: 'string',

      /**
       * timestamp when builds started failing
       */
      start_timestamp: 'timestamp',

      /**
       * timestamp when build failures are resolved
       */
      end_timestamp: 'timestamp',
    },
  },

  freight_to_pr: {
    dataset: 'product_eng',
    table: 'freight_to_pull_request',
    schema: {
      deploy_id: 'integer',
      pull_request_number: 'integer',
      commit_sha: 'string',
    },
  },
};

type TargetConfig = {
  dataset: string;
  table: string;
  schema: Record<string, string>;
};

export async function _insert(
  data: Record<string, any>,
  targetConfig: TargetConfig
) {
  if (DRY_RUN) {
    /* eslint-disable no-console */
    console.log(
      `\n🌸🌸🌸🌸🌸 Dry Run: BigQuery Insert Into ${targetConfig.dataset}.${targetConfig.table} 🌸🌸🌸🌸🌸`
    );
    console.log('\nData:', data);
    console.log('\nSchema:', objectToSchema(targetConfig.schema));
    /* eslint-enable no-console */
    return;
  }

  const tx = Sentry.getCurrentHub()?.getScope()?.getTransaction();
  const span = tx?.startChild({
    op: 'bigquery',
    description: `insert.${targetConfig.dataset}`,
  });
  const dataset = bigqueryClient.dataset(targetConfig.dataset);
  const table = dataset.table(targetConfig.table);

  try {
    const results = await table.insert(data, {
      schema: objectToSchema(targetConfig.schema),
    });
    return results;
  } catch (err) {
    if (err instanceof Error && err.name === 'PartialFailureError') {
      // Some rows failed to insert, while others may have succeeded.

      // This error pops up when our automations close an old issue:
      // Value 1458881574000000 for field created_at of the destination table super-big-data:open_source.github_events is outside the allowed bounds. You can only stream to date range within 1825 days in the past and 366 days in the future relative to the current date.
      //
      // Special error from google sdk I think?
      // @ts-expect-error
      err.errors?.forEach((error) => {
        Sentry.setContext('errors', {
          messages: error.errors.map((e) => e.message).join('\n'),
          reasons: error.errors.map((e) => e.reason).join('\n'),
        });
        Sentry.setContext('row', error.row);
        Sentry.captureException(new Error('Unable to insert row'));
      });
      return;
    }

    throw err;
  } finally {
    span?.finish();
  }
}

export function insert({ meta = {}, ...row }) {
  return _insert({ ...row, meta: JSON.stringify(meta) }, TARGETS.product);
}

export function insertAssetSize({ pull_request_number, ...data }) {
  return _insert(
    {
      ...data,
      pull_request_number:
        typeof pull_request_number === 'number' ? pull_request_number : -1,
      created_at: new Date(),
    },
    TARGETS.assetSize
  );
}

export async function insertOss(
  eventType: string,
  payload: Record<string, any>
) {
  if (!payload.repository) {
    // we are not interested in events w/o a repo
    return;
  }
  const userType = await getOssUserType(payload);
  const data: Record<string, any> = {
    type: eventType,
    action: payload.action,
    username: payload.sender.login,
    user_id: payload.sender.id,
    user_type: userType,
    repository: payload.repository.full_name,
    timeToRouteBy: null,
    timeToTriageBy: null,
    product_area: null,
    teams: [],
  };

  if (eventType === 'issues') {
    const { issue, label } = payload;

    data.object_id = issue.number;
    data.created_at = issue.created_at;
    data.updated_at = issue.updated_at;
    if (data.action === 'labeled' || data.action === 'unlabeled') {
      /*
        The only times a label will be null here is when a label is deleted.
        This triggers an unlabeling event and we want to ignore those events.
      */
      if (label != null) {
        data.target_id = label.id;
        data.target_name = label.name;
        data.target_type = 'label';
        if (label.name.startsWith(PRODUCT_AREA_LABEL_PREFIX)) {
          data.product_area = label.name;
        } else {
          data.product_area =
            issue.labels?.find((label) =>
              label.name.startsWith(PRODUCT_AREA_LABEL_PREFIX)
            )?.name || null;
        }
        data.product_area =
          data.product_area &&
          data.product_area.slice(PRODUCT_AREA_LABEL_PREFIX.length);
        if (data.action === 'labeled') {
          data.timeToRouteBy = calculateSLOViolationRoute(
            data.target_name,
            payload.repository.name,
            payload.organization.login
          );
          data.timeToTriageBy = calculateSLOViolationTriage(
            data.target_name,
            issue.labels,
            payload.repository.name,
            payload.organization.login
          );
        }
      }
    }
    data.teams = getTeams(
      payload.repository.name,
      payload.organization.login,
      data.product_area
    );
  } else if (eventType === 'issue_comment') {
    const { comment, issue } = payload;

    data.object_id = comment.id;
    data.created_at = comment.created_at;
    data.updated_at = comment.updated_at;
    data.target_name = issue.title;
    data.target_id = issue.number;
    data.target_type = 'issue';
    data.product_area =
      issue.labels?.find((label) =>
        label.name.startsWith(PRODUCT_AREA_LABEL_PREFIX)
      )?.name || null;
    data.product_area =
      data.product_area &&
      data.product_area.slice(PRODUCT_AREA_LABEL_PREFIX.length);
    data.teams = getTeams(
      payload.repository.name,
      payload.organization.login,
      data.product_area
    );
    if (issue.pull_request) {
      data.type = 'pull_request_comment';
      data.target_type = 'pull_request';
    }
  } else if (eventType === 'pull_request') {
    const { action, pull_request, requested_reviewer, requested_team, label } =
      payload;

    data.object_id = pull_request.number;
    data.created_at = pull_request.created_at;
    data.updated_at = pull_request.updated_at;

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

    if (action === 'locked') {
      data.action = 'locked';
    }

    if (action === 'closed') {
      data.action = pull_request.merged ? 'merged' : 'closed';
    }

    if (action === 'labeled' || action === 'unlabeled') {
      data.target_id = label.id;
      data.target_name = label.name;
      data.target_type = 'label';
    }
  } else if (eventType === 'pull_request_review') {
    const { review, pull_request } = payload;

    data.object_id = review.id;
    data.created_at = review.submitted_at;
    data.updated_at = pull_request.updated_at;
    data.target_id = pull_request.number;
    data.target_name = review.state;
    data.target_type = 'pull_request';
  } else if (eventType === 'discussion') {
    const { discussion } = payload;
    data.object_id = discussion.number;
    data.created_at = discussion.created_at;
    data.updated_at = discussion.updated_at;
    data.target_id = discussion.number;
    data.target_name = discussion.title;
    data.target_type = 'discussion';
  } else if (eventType === 'discussion_comment') {
    const { discussion, comment } = payload;
    data.object_id = discussion.number;
    data.created_at = comment.created_at;
    data.updated_at = comment.updated_at;
    data.target_id = comment.id;
    data.target_name = discussion.title;
    data.target_type = 'discussion';
  } else {
    // Unknown payload event, ignoring...
    return {};
  }
  return await _insert(data, TARGETS.oss);
}

export function mapDeployToPullRequest(
  deploy_id: number,
  pull_request_number: number,
  commit_sha: string | null
) {
  return _insert(
    {
      deploy_id,
      pull_request_number,
      commit_sha,
    },
    TARGETS.freight_to_pr
  );
}

interface BuildFailureParams {
  build_id: string;
  repo: string;
  start_timestamp: Date;
  end_timestamp: Date;
}

export function insertBuildFailure({
  build_id,
  repo,
  start_timestamp,
  end_timestamp,
}: BuildFailureParams) {
  return _insert(
    {
      build_id,
      repo,
      start_timestamp,
      end_timestamp,
    },
    TARGETS.brokenBuilds
  );
}
