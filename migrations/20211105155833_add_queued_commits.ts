import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('queued_commits', (table) => {
    table.increments('id');
    table.string('head_sha').notNullable();
    table.string('sha').notNullable();
    table.jsonb('data');
    table.index('head_sha');
    table.index('sha');
  });

  // Adding these columns to store entire Freight payload as we need these values for generating a deploy message
  await knex.schema.alterTable('deploys', (table) => {
    table.string('link');
    table.string('title');
    table.setNullable('duration');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('queued_commits');
  await knex.schema.alterTable('deploys', (table) => {
    table.dropColumn('link');
    table.dropColumn('title');
    table.dropNullable('duration');
  });
}
