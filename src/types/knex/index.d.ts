import Knex from 'knex';

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

  interface Tables {
    users: User;
    required_checks_status: RequiredStatusCheck;
  }
}
