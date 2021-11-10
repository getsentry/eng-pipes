import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('deploys', (table) => {
    table.dropUnique(['external_id', 'environment']);
    table.unique(['external_id', 'environment', 'app_name']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('deploys', (table) => {
    table.dropUnique(['external_id', 'environment', 'app_name']);
    table.unique(['external_id', 'environment']);
  });
}
