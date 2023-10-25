import { BigQuery } from '@google-cloud/bigquery';

import { PROJECT } from '@/config';

const bigqueryClient = new BigQuery({ projectId: PROJECT });

export async function getIssueEventsForTeam(team) {
  const query = `WITH labelings AS (
    SELECT
      issues.object_id AS issue_id,
      issues.repository as repository,
      ROW_NUMBER() OVER(PARTITION BY issues.object_id, issues.repository ORDER BY issues.updated_at) AS group_id,
      issues.updated_at AS dt,
      issues.timeToTriageBy as dt_triage_by,
      issues.teams as teams,
      issues.product_area as product_area,
    FROM
      \`open_source.github_events\` AS issues
    WHERE
      issues.type = 'issues'
      AND issues.action = 'labeled'
      AND issues.target_name = 'Waiting for: Product Owner'
  ),
  unlabelings AS (
    SELECT
      issues.object_id AS issue_id,
      issues.repository as repository,
      ROW_NUMBER() OVER(PARTITION BY issues.object_id, issues.repository ORDER BY issues.updated_at) AS group_id,
      issues.updated_at AS dt,
      issues.teams as teams,
      issues.product_area as product_area,
    FROM
      \`open_source.github_events\` as issues
    WHERE
      issues.type = 'issues'
      AND (
        issues.action = 'unlabeled'
        AND issues.target_name = 'Waiting for: Product Owner'
        OR issues.action = 'closed'
        OR issues.action = 'deleted'
        OR issues.action = 'transferred'
      )
  ),
  issues_to_count AS (
    SELECT
      labelings.issue_id AS issue_id,
      labelings.repository as repository,
      IF(
        unlabelings.dt IS NULL,
        CURRENT_TIMESTAMP(),
        unlabelings.dt
      ) AS triaged_dt,
      labelings.dt AS routed_dt,
      labelings.dt_triage_by AS triage_by_dt,
      labelings.teams AS teams,
      labelings.product_area AS product_area
    FROM
      labelings
      LEFT OUTER JOIN unlabelings using (issue_id, repository, group_id)
    WHERE
      (labelings.dt < unlabelings.dt
      OR unlabelings.dt IS NULL)
      AND timestamp_diff(
        CURRENT_TIMESTAMP(),
        labelings.dt,
        day
      ) <= 7
  )
    SELECT
      issue_id,
      repository,
      product_area,
      triaged_dt,
      triage_by_dt,
    FROM
      issues_to_count
      WHERE '${team}' in UNNEST(teams)
      ;`;

  const [issues] = await bigqueryClient.query(query);

  return issues;
}

export async function getDiscussionEvents() {
  const discussionsQuery = `
    SELECT
      discussions.target_name as title,
      discussions.repository as repository,
      discussions.object_id as discussion_number,
      COUNT(discussions.target_name) as num_comments,
    FROM
      \`open_source.github_events\` AS discussions
    WHERE
      discussions.type = 'discussion_comment'
      AND timestamp_diff(
        CURRENT_TIMESTAMP(),
        discussions.created_at,
        day
      ) <= 7
    GROUP BY discussions.target_name, discussions.repository, discussions.object_id
    ORDER BY num_comments DESC
    ;`;

  const [discussions] = await bigqueryClient.query(discussionsQuery);

  const discussionCommentersQuery = `
    SELECT
      discussions.username as username,
      COUNT(discussions.username) as num_comments,
    FROM
      \`open_source.github_events\` AS discussions
    WHERE
      discussions.type = 'discussion_comment'
      AND timestamp_diff(
        CURRENT_TIMESTAMP(),
        discussions.created_at,
        day
      ) <= 7
      AND discussions.user_type != 'external'
      AND discussions.user_type != 'bot'
    GROUP BY discussions.username
    ORDER BY num_comments DESC
    ;`;

  const [discussionCommenters] = await bigqueryClient.query(
    discussionCommentersQuery
  );

  return {
    discussions,
    discussionCommenters,
  };
}
