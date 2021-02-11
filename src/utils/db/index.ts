import Knex from 'knex';

import {
  DB_HOST,
  DB_INSTANCE_CONNECTION_NAME,
  DB_NAME,
  DB_PASSWORD,
  DB_USER,
} from '@app/config';

const db = Knex({
  client: 'pg',
  connection: {
    host: `${DB_HOST}${
      DB_INSTANCE_CONNECTION_NAME ? `/${DB_INSTANCE_CONNECTION_NAME}` : ''
    }`,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  },
});

export { db };
