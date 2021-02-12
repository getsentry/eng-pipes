import Knex from 'knex';

import config from '../src/knexfile';

function getDbConnection() {
  return Knex(
    config[process.env.ENV !== 'production' ? 'development' : 'production']
  );
}

async function deleteDatabase() {
  const db = getDbConnection();

  try {
    await db.raw('DROP DATABASE IF EXISTS test_database');
  } catch (err) {
    console.log(err);
  } finally {
    await db.destroy();
  }
}

module.exports = async () => {
  await deleteDatabase();
};
