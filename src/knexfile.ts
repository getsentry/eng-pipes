import path from 'path';

import {
  DB_HOST,
  DB_INSTANCE_CONNECTION_NAME,
  DB_NAME,
  DB_PASSWORD,
  DB_USER,
} from './config';

const config = {
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
      directory: path.join(__dirname, '..', 'migrations'),
      tableName: 'knex_migrations',
    },
  },

  test: {
    client: 'pg',
    connection: 'postgresql://postgres:docker@127.0.0.1:5434/postgres',
    migrations: {
      directory: path.join(__dirname, '..', 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, '..', 'seeds'),
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
      directory: path.join(__dirname, '..', 'migrations'),
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
      directory: path.join(__dirname, '..', 'migrations'),
      tableName: 'knex_migrations',
    },
  },
};

module.exports = config;

export default config;
