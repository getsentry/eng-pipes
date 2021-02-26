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

  interface Tables {
    users: User;
    slack_messages: SlackMessageRow;
    required_checks_status: RequiredStatusCheck;
  }
}
