import Knex from 'knex';

declare module 'knex/types/tables' {
  interface User {
    id: number;
    email: string;
    slackUser: string;
    githubUser?: string;
    created: string;
    updated: string;
  }

  interface Tables {
    users: User;
  }
}
