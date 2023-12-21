const mockQuery = jest.fn(async () => {
  return [
    {
      issue_id: '1',
      repository: 'routing-repo',
      product_area: 'Issues',
      triaged_dt: { value: '2023-10-13T16:53:15.000Z' },
      triage_by_dt: { value: '2023-10-12T21:52:14.223Z' },
    },
  ];
});

jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: function () {
    return {
      query: mockQuery,
    };
  },
}));
import { getGitHubActivityMetrics, getIssueEventsForTeam } from './scores';

describe('score tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('should send the right sql we expect for getIssueEventsForTeam', () => {
    getIssueEventsForTeam('team-ospo');
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
        NULL,
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
        labelings.dt_triage_by,
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
      WHERE 'team-ospo' in UNNEST(teams)
      ;`;
    expect(mockQuery).toHaveBeenCalledWith(query);
  });

  it('should send the right sql we expect for getDiscussionEvents', async () => {
    await getGitHubActivityMetrics();
    const discussionCommentsQuery = `
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

    const gitHubCommentersQuery = `
    SELECT
      comments.username as username,
      COUNT(comments.username) as num_comments,
    FROM
      \`open_source.github_events\` AS comments
    WHERE
      (comments.type = 'discussion_comment' OR comments.type = 'issue_comment')
      AND timestamp_diff(
        CURRENT_TIMESTAMP(),
        comments.created_at,
        day
      ) <= 7
      AND comments.user_type != 'external'
      AND comments.user_type != 'bot'
    GROUP BY comments.username
    ORDER BY num_comments DESC
    ;`;

    const issueCommentsQuery = `
    SELECT
      issues.target_name as title,
      issues.repository as repository,
      issues.target_id as issue_number,
      COUNT(issues.target_name) as num_comments,
    FROM
      \`open_source.github_events\` AS issues
    WHERE
    issues.type = 'issue_comment'
      AND timestamp_diff(
        CURRENT_TIMESTAMP(),
        issues.created_at,
        day
      ) <= 7
    GROUP BY issues.target_name, issues.repository, issues.target_id
    ORDER BY num_comments DESC
    ;`;
    expect(mockQuery).toHaveBeenCalledWith(discussionCommentsQuery);
    expect(mockQuery).toHaveBeenCalledWith(gitHubCommentersQuery);
    expect(mockQuery).toHaveBeenCalledWith(issueCommentsQuery);
  });
});
