import { FreightPayload } from '@/types';
import { freight } from '@api/freight';
import { db } from '@utils/db';

// Exported for tests
export async function handler(payload: FreightPayload) {
  const {
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
    link,
    title,
    date_created,
    date_started,
    date_finished,
  } = payload;
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
      link,
      title,
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

export async function deployState() {
  freight.on('*', handler);
}
