import { db } from '.';

export async function getLastSuccessfulDeploy() {
  return await db('deploys')
    .where({
      status: 'finished',
      app_name: 'getsentry',
    })
    .orderBy('finished_at', 'desc')
    .first('*');
}
