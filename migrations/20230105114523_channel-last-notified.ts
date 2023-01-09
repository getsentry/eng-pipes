import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('channel_last_notified', function (table) {
    table.increments('id');
    table.string('channel_id', 32).notNullable();
    table.timestamp('last_notified_at').defaultTo(knex.fn.now());
    table.unique(['channel_id']);
    table.index('channel_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('channel_last_notified');
}
