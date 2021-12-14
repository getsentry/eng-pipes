import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('build_failures', (table) => {
    table.bigIncrements('id').primary();
    table.string('sha').notNullable();
    table.string('job_name');
    table.text('annotation');
    table.string('annotation_title');
    table.string('annotation_path');
    table.timestamp('failed_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('build_failures');
}
