import Knex from 'knex';

import knexConfig from '~/src/knexfile';

const config =
  knexConfig[process.env.NODE_ENV || ''] || knexConfig['production'];
const db = Knex(config);

export { db };
