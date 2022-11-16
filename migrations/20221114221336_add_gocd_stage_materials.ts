import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('gocd-stage-materials', (table) => {
    table.string('stage_material_id').primary();
    table.string('pipeline_id').notNullable();
    table.string('url').notNullable();
    table.string('branch').notNullable();
    table.string('revision').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gocd-stage-materials');
}
