import { MessageAttachment } from '@slack/bolt';

import { CheckRunForRequiredChecksText } from '..';

import { BuildStatus } from '~/src/config';
import { SlackMessage } from '~/src/config/slackMessage';

declare module 'knex/types/tables' {
  interface User {
    id: number;
    email: string;
    slackUser: string;
    githubUser?: string;
    created: string;
    updated: string;
    preferences: Record<string, any>;
  }

  interface RequiredStatusCheck {
    ref: string;
    channel: string;
    ts: string;
    status: BuildStatus;
    failed_at: Date;
    passed_at: Date | null;
  }

  /**
   * This interface describes the `context` field of `SlackMessageRow<REQUIRED_CHECK>`
   */
  interface RequiredCheckContext {
    /**
     * The build status of commit
     */
    status: BuildStatus;

    /**
     * Partial fields from GitHub's Check Run payload
     */
    checkRun: CheckRunForRequiredChecksText;

    /**
     * Timestamp when the build failed
     */
    failed_at: Date;

    /**
     * Timestamp when the build is no longer failing (not necessarily "passing"
     * as it can be unknown)
     */
    updated_at?: Date;
  }

  /**
   * This interface describes the `context` field of `SlackMessageRow<PLEASE_DEPLOY>`
   */
  interface PleaseDeployContext {
    /**
     * Slack user or channel id
     */
    target: string;

    /**
     * Slack lmessage content
     */
    text: string;

    /**
     * Slack's message attachment blocks
     */
    blocks: Exclude<MessageAttachment['blocks'], undefined>;
  }

  type SlackMessageRowContext =
    | { type: SlackMessage.REQUIRED_CHECK; context: RequiredCheckContext }
    | { type: SlackMessage.PLEASE_DEPLOY; context: PleaseDeployContext };

  type SlackMessageRow<T> = {
    /**
     * Database id
     */
    id: string;

    /**
     * An external identifier for the message (e.g. a commit SHA)
     */
    refId: string;

    /**
     * The Slack channel/target where the message was sent
     */
    channel: string;

    /**
     * This is the `ts` field from Slack, it looks like a timestamp, but is not
     */
    ts: string;

    /**
     * Type of the message
     */
    type: T;
  } & SlackMessageRowContext;

  interface Deploys {
    id: number;
    external_id: number;
    user_id: number;
    app_name: string;
    user: string;
    ref: string;
    sha: string;
    previous_sha: string;
    link: string;
    title: string;
    status: FreightStatus;
    environment: string;
    duration: number | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  }

  /**
   * Keeps track of commits that are queued to be deployed
   */
  interface QueuedCommits {
    id: number;
    head_sha: string; // The commit that is being deployed
    sha: string; // sha of commit included in deploy
    data: string; // Commit object from GitHub API
  }

  /**
   * TODO: GitHub's `compareCommits` can be quite slow, so we're going to cache the results
   * Ideally we would model this as a graph so that we query for commits within base/head.
   */
  interface Commits {
    id: number;
    head: string;
    base: string;
    data: string; // Commit object from GitHub API
    created_at: string;
    last_accessed_at: string;
  }

  interface Tables {
    queued_commits: QueuedCommits;
    deploys: Deploys;
    required_checks_status: RequiredStatusCheck;
    slack_messages: SlackMessageRow;
    users: User;
  }

  interface BuildFailures {
    id: number;
    sha: string;
    job_name?: string;
    annotation?: string;
    annotation_title?: string;
    annotation_path?: string;
    failed_at: Date;
  }
}
