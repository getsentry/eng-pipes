import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('gocd-stages', (table) => {
    table.string('pipeline_id').primary();
    table.string('pipeline_name').notNullable();
    table.string('pipeline_counter').notNullable();
    table.string('pipeline_group').notNullable();
    table.json('pipeline_build_cause').notNullable();
    table.string('stage_name').notNullable();
    table.string('stage_counter').notNullable();
    table.string('stage_approval_type').notNullable();
    table.string('stage_approved_by').notNullable();
    table.string('stage_state').notNullable();
    table.string('stage_result').notNullable();
    table.timestamp('stage_create_time').notNullable();
    table.timestamp('stage_last_transition_time');
    table.json('stage_jobs').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('gocd-stages');
}
