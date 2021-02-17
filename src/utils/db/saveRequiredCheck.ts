import { db } from '@utils/db';

type SaveRequiredCheck = {
  ref: string;
  channel?: string;
  ts?: string;
  status?: 'success' | 'failure';
};

export async function saveRequiredCheck(check: SaveRequiredCheck) {
  let query = db('required_checks_status').insert({
    ...check,
    passed_at: check.status === 'success' ? new Date() : null,
  });

  if (check.status) {
    query = query.onConflict('ref').merge({
      status: check.status,
    });
  }

  return await query;
}
