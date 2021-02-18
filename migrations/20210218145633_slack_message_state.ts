import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('slack_messages', (table) => {
    table.bigIncrements('id').primary();
    table.string('channel');
    table.string('ts');
    table.string('refId');
    table.string('type');
    table.jsonb('context').defaultTo('{}');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('slack_messages');
}
