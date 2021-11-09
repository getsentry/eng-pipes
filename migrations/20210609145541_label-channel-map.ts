import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('label_to_channel', function (table) {
    table.increments('id');
    table.string('label_name', 255).notNullable();
    table.string('channel_id', 32).notNullable();
    table.unique(['label_name', 'channel_id']);
    table.index('label_name');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('label_to_channel');
}
