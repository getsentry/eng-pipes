import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  knex.schema.table('development_metrics', (table) => {
    table.string('sha');
  });
}

export async function down(knex: Knex): Promise<void> {
  knex.schema.table('development_metrics', (table) => {
    table.dropColumn('sha');
  });
}
