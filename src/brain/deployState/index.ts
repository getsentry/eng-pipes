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
    }) => {
      const constraints = {
        external_id: deploy_number,
        app_name,
        environment,
      };

      const result = await db('deploys').where(constraints).first('*');

      if (!result) {
        await db('deploys').insert({
          external_id: deploy_number,
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
        });
        return;
      }

      await db('deploys').where(constraints).update({
        status,
        duration,
        started_at: date_started,
        finished_at: date_finished,
      });
    }
  );
}
