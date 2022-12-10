import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('gocd-stages', (table) => {
    table.integer('stage_counter').alter();
    table.integer('pipeline_counter').alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('gocd-stages', (table) => {
    table.string('stage_counter').alter();
    table.string('pipeline_counter').alter();
  });
}
