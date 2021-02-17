import { db } from '@utils/db';

type SaveRequiredCheck = {
  ref: string;
  channel?: string;
  ts?: string;
  status?: 'success' | 'failure';
};

export async function saveRequiredCheck(check: SaveRequiredCheck) {
  return await db('required_checks_status')
    .insert({
      ...check,
      passed_at: check.status === 'success' ? new Date() : null,
    })
    .onConflict('ref')
    .merge();
}
