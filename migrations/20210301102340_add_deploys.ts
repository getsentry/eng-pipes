import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('deploys', (table) => {
    table.bigInteger('id').primary();
    table.bigInteger('user_id').notNullable();
    table.string('app_name').notNullable();
    table.string('user').notNullable();
    table.string('ref').notNullable();
    table.string('sha').notNullable();
    table.string('previous_sha').notNullable();
    table.string('status').notNullable();
    table.string('environment').notNullable();
    table.integer('duration');
    table.timestamp('created_at');
    table.timestamp('started_at');
    table.timestamp('finished_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('deploys');
}
