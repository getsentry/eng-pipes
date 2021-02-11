// Update with your config settings.
import {
  DB_HOST,
  DB_INSTANCE_CONNECTION_NAME,
  DB_NAME,
  DB_PASSWORD,
  DB_USER,
} from './src/config';

module.exports = {
  local: {
    client: 'postgresql',
    connection: {
      database: 'postgres',
      user: 'postgres',
      password: 'docker',
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: 'knex_migrations',
    },
  },
  proxy: {
    client: 'postgresql',
    connection: {
      database: 'postgres',
      user: 'postgres',
      password: DB_PASSWORD,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: 'knex_migrations',
    },
  },
  production: {
    client: 'postgresql',
    connection: {
      host: `${DB_HOST}/${DB_INSTANCE_CONNECTION_NAME}`,
      database: DB_NAME,
      user: DB_USER,
      password: DB_PASSWORD,
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: 'knex_migrations',
    },
  },
};
