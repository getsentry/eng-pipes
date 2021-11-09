import Knex from 'knex';

import { BuildStatus } from '@/config';
import { SlackMessage } from '@/config/slackMessage';

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

  interface SlackMessageRow {
    id: string;
    refId: string;
    channel: string;
    ts: string;
    type: SlackMessage;
    context: Record<string, any>;
  }

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
}
