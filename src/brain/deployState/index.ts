import { freight } from '@api/freight';
import { db } from '@utils/db';

export async function deployState() {
  freight.on(
    '*',
    async ({
      deploy_number,
      user_id,
      app_name,
      user,
      sha,
      ref,
      previous_sha,
      status,
      environment,
      duration,
      date_created,
      date_started,
      date_finished,
    }) =>
      await db('deploys')
        .insert({
          id: deploy_number,
          user_id,
          app_name,
          user,
          ref,
          sha,
          previous_sha,
          status,
          environment,
          duration,
          created_at: date_created,
          started_at: date_started,
          finished_at: date_finished,
        })
        .onConflict('id')
        .merge()
  );
}
