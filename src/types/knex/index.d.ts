import Knex from 'knex';

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
    status: 'success' | 'failure';
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
    user_id: number;
    app_name: string;
    user: string;
    ref: string;
    sha: string;
    previous_sha: string;
    status: FreightStatus;
    environment: string;
    duration: number;
    created_at: string;
    date_created;
    started_at: string;
    finished_at: string;
  }

  interface Tables {
    deploys: Deploys;
    required_checks_status: RequiredStatusCheck;
    slack_messages: SlackMessageRow;
    users: User;
  }
}
