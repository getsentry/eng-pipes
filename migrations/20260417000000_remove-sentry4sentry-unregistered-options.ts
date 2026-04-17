import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('unregistered_options').where({ region: 'sentry4sentry' }).del();
}

export async function down(knex: Knex): Promise<void> {}
