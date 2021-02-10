import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id').primary();
    table.string('email').notNullable();
    table.string('slack_user').notNullable();
    table.string('github_user').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('user_preferences', (table) => {
    table.bigIncrements('id').primary();
    table
      .integer('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.json('preferences');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('user_emails', (table) => {
    table
      .integer('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('email').notNullable().primary();
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const table of ['users']) {
    await knex.schema.dropTable(table);
  }
}
