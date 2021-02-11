import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id').primary();
    table.string('email').notNullable();
    table.string('slackUser').notNullable();
    table.string('githubUser');
    table.timestamp('created').defaultTo(knex.fn.now());
    table.timestamp('updated').defaultTo(knex.fn.now());
  });

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

  await knex.schema.createTable('user_emails', (table) => {
    table
      .integer('userId')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('email').notNullable().primary();
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const table of ['user_emails', 'user_preferences', 'users']) {
    await knex.schema.dropTable(table);
  }
}
