import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('deploys', (table) => {
    table.float('duration').alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('deploys', (table) => {
    table.integer('duration').alter();
  });
}
