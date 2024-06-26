import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('auto_routed_comments', function (table) {
    table.increments('id');
    table.string('owner');
    table.string('repo');
    table.string('url');
    table.string('product_area');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('auto_routed_comments');
}
