import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('unregistered_options', function (table) {
    table.increments('id');
    table.string('option_name').notNullable();
    table.string('region').notNullable();
    table.timestamp('reported_at').defaultTo(knex.fn.now());
    table.unique(['option_name', 'region']);
    table.index('region');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('unregistered_options');
}
