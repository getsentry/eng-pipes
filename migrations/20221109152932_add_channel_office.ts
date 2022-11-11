import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('label_to_channel', (table) => {
    table.string('office');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('label_to_channel', async (table) => {
    if (!(await knex.schema.hasColumn('label_to_channel', 'office'))) {
      return;
    }
    table.dropColumn('office');
  });
}
