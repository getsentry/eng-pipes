import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.index(['email', 'slackUser', 'githubUser']);
  });

  await knex.schema.alterTable('slack_messages', (table) => {
    table.index(['refId']);
  });

  await knex.schema.alterTable('required_check_status', (table) => {
    table.index(['ref']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['email', 'slackUser', 'githubUser']);
  });

  await knex.schema.alterTable('slack_messages', (table) => {
    table.dropIndex(['refId']);
  });

  await knex.schema.alterTable('required_check_status', (table) => {
    table.dropIndex(['ref']);
  });
}
