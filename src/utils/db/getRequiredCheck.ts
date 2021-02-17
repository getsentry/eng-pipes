import { db } from '@utils/db';

export async function getRequiredCheck(ref: string) {
  return await db('required_checks_status').where({ ref }).first('*');
}
