import { db } from '@utils/db';

export async function saveUnregisteredOptions(
  options: string[],
  region: string
): Promise<void> {
  await db.transaction(async (trx) => {
    await trx('unregistered_options').where({ region }).del();
    if (options.length > 0) {
      const rows = options.map((option_name) => ({ option_name, region }));
      await trx('unregistered_options').insert(rows);
    }
  });
}

export async function getUnregisteredOptions(): Promise<
  { option_name: string; region: string }[]
> {
  return await db('unregistered_options').select('option_name', 'region');
}
