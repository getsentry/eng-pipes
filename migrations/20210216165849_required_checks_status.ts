import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('required_checks_status', (table) => {
    table.string('ref').notNullable().primary();
    table.string('channel');
    table.string('ts');
    table.string('status').defaultTo('failure');
    table.timestamp('failed_at').defaultTo(knex.fn.now());
    table.timestamp('passed_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('required_checks_status');
}
