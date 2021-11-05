import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTable('user_preferences');
  await knex.schema.alterTable('users', (table) => {
    table.string('email').alter();
    table.unique(['email']);
    table.jsonb('preferences').defaultTo('{}');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_preferences', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('userId')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.json('preferences');
    table.timestamp('created').defaultTo(knex.fn.now());
    table.timestamp('updated').defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('users', async (table) => {
    table.dropUnique(['email']);
    table.string('email').notNullable().alter();
    if (await knex.schema.hasColumn('users', 'preferences')) {
      table.dropColumn('preferences');
    }
  });
}
