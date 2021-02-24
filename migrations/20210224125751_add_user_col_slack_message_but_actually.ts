import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('slack_messages', (table) => {
    table.string('user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('slack_messages', async (table) => {
    if (!(await knex.schema.hasColumn('slack_messages', 'user'))) {
      return;
    }
    table.dropColumn('user');
  });
}
