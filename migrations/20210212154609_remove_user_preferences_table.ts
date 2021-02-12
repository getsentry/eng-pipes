import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTable('user_preferences');
  await knex.schema.alterTable('users', (table) => {
    table.unique(['email']);
    table.jsonb('preferences').defaultTo('{}');
  });
}

export async function down(knex: Knex): Promise<void> {}
