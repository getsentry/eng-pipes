type TravisRepository = {
  id: number;
  name: string;
  owner_name: string;
  url: string | null;
};

type TravisEventType = 'push' | 'pull_request' | 'cron' | 'api';

/**
 * 0: Represents a build that has completed successfully
 * 1: Represents a build that has not yet completed or has completed and failed
 */
type TravisStatus = 0 | 1;
type TravisResult = TravisStatus;

/**
 * State of the build
 */
type TravisState =
  | 'passed'
  | 'pending'
  | 'fixed'
  | 'broken'
  | 'failed'
  | 'canceled'
  | 'errored';

type TravisConfig = any;

type TravisMatrix = {
  id: number;
  repository_id: TravisRepository['id'];
  parent_id: TravisPayload['id'];
  /**
   * Travis build number
   * e.g. 173.5
   */
  number: string;
  state: TravisState;
  config: TravisConfig;
  status: TravisStatus;
  result: TravisResult;
  commit: string;
  branch: string;
  message: string;
  compare_url: string;
  started_at: string;
  finished_at: string | null;
  committed_at: string;
  author_name: string;
  author_email: string;
  committer_name: string;
  committer_email: string;
  allow_failure: boolean | null;
};

export type TravisPayload = {
  id: number;
  /**
   * Pull Request Number
   */
  number: string;

  type: TravisEventType;
  state: TravisState;
  status: TravisStatus;
  result: TravisStatus;
  status_message: string;
  result_message: string;
  started_at: string;
  finished_at: string;
  duration: number;
  build_url: string;
  commit_id: number;

  /**
   * Full commit sha
   */
  commit: string;
  /**
   * i.e. commit sha of master
   * 704b6b8cae9023275785f8a752025d117e788f38
   */
  base_commit: string;
  /**
   * i.e. PR's head commit
   * e2fb88b6df64a87c2cc78256a50a1e0fe1fbefd2
   */

  head_commit: string;

  /**
   * I think this is the target branch to merge into...
   */
  branch: string;
  /**
   * Commit message
   */
  message: string;

  /**
   * e.g. https://github.com/billyvg/sentry/pull/11
   */
  compare_url: string;
  committed_at: string;
  author_name: string;
  author_email: string;
  committer_name: string;
  committer_email: string;
  pull_request: boolean;
  pull_request_number: number | null;
  pull_request_title: number | null;
  tag: string | null;
  repository: TravisRepository;
  matrix: TravisMatrix[];
  config: TravisConfig;
};
