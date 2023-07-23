import * as dotenv from 'dotenv';

// Immediately load the test env, because it can cause test bugs if the proper
// values are not seen by the rest of global setup.
dotenv.config({ path: './.env.test', override: true });

import Knex from 'knex';

import config from '../src/knexfile';

function getDbConnection() {
  return Knex(
    config[process.env.ENV !== 'production' ? 'development' : 'production']
  );
}

async function createDatabase() {
  const db = getDbConnection();

  try {
    await db.raw('DROP DATABASE IF EXISTS test_database');
    await db.raw('CREATE DATABASE test_database');
  } catch (err) {
    console.error(err);
  } finally {
    await db.destroy();
  }
}

module.exports = async () => {
  await createDatabase();
};
