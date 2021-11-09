import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('slack_messages', (table) => {
    table.dropColumn('user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('slack_messages', (table) => {
    table.string('user');
  });
}
