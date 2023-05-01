import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Since we only have ~a dozen subscriptions here (no good visibility,
  // actually, since we don't have direct db access in prod and no web or Slack
  // UI set up), we decided to start over from scratch for the new product
  // area-based mapping.
  await knex('label_to_channel').del();
}

export async function down(knex: Knex): Promise<void> {}
