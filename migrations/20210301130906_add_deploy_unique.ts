import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('deploys', (table) => {
    table.dropPrimary();
    table.renameColumn('id', 'external_id');
    table.unique(['external_id', 'environment']);
  });
  await knex.schema.alterTable('deploys', (table) => {
    table.bigIncrements('id').primary();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('deploys', (table) => {
    table.dropColumn('id');
    table.dropUnique(['external_id', 'environment']);
  });

  await knex.schema.alterTable('deploys', (table) => {
    table.renameColumn('external_id', 'id');
    table.primary(['id']);
  });
}
