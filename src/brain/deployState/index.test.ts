import payload from '@test/payloads/freight.json';

import { freight } from '@api/freight';
import * as utils from '@utils/db';

import { deployState } from '.';

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 1));
}

describe('deployState', function () {
  let dbMock: jest.SpyInstance;

  beforeAll(async function () {
    await utils.db.migrate.latest();
    deployState();
  });

  afterAll(async function () {
    await utils.db.migrate.rollback();
    await utils.db.destroy();
  });

  beforeEach(async function () {
    dbMock = jest.spyOn(utils, 'db');
  });

  afterEach(async function () {
    dbMock.mockRestore();
    await utils.db('deploys').delete();
  });

  it('saves and updates deploy state to database', async function () {
    let deploys;

    freight.emit('queued', {
      ...payload,
      status: 'queued',
      date_started: null,
      date_finished: null,
      duration: null,
    });

    expect(dbMock).toHaveBeenCalledTimes(1);
    await tick();
    await tick();
    // @ts-ignore
    deploys = await dbMock('deploys').select('*');
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toMatchObject({
      app_name: 'getsentry',
      created_at: '2020-05-13T23:43:52.000Z',
      duration: null,
      environment: 'production',
      external_id: '13',
      finished_at: null,
      previous_sha: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
      ref: 'master',
      sha: 'c88d886ba52bd85431052abaef4916469f7db2e8',
      started_at: null,
      status: 'queued',
      user: 'billy@sentry.io',
      user_id: '1',
    });

    dbMock.mockClear();
    freight.emit('started', {
      ...payload,
      status: 'started',
      date_finished: null,
      duration: null,
    });
    expect(dbMock).toHaveBeenCalledTimes(1);
    // I think `onConflict` is causing this
    await tick();
    await tick();
    await tick();
    // @ts-ignore
    deploys = await dbMock('deploys').select('*');
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toMatchObject({
      app_name: 'getsentry',
      created_at: '2020-05-13T23:43:52.000Z',
      duration: null,
      environment: 'production',
      external_id: '13',
      finished_at: null,
      previous_sha: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
      ref: 'master',
      sha: 'c88d886ba52bd85431052abaef4916469f7db2e8',
      started_at: '2020-05-13T23:43:52.000Z',
      status: 'started',
      user: 'billy@sentry.io',
      user_id: '1',
    });

    dbMock.mockClear();
    freight.emit('finished', {
      ...payload,
      status: 'finished',
    });
    expect(dbMock).toHaveBeenCalledTimes(1);
    await tick();
    await tick();
    await tick();
    // @ts-ignore
    deploys = await dbMock('deploys').select('*');
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toMatchObject({
      app_name: 'getsentry',
      created_at: '2020-05-13T23:43:52.000Z',
      duration: 600,
      environment: 'production',
      external_id: '13',
      finished_at: '2020-05-15T20:59:02.000Z',
      previous_sha: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
      ref: 'master',
      sha: 'c88d886ba52bd85431052abaef4916469f7db2e8',
      started_at: '2020-05-13T23:43:52.000Z',
      status: 'finished',
      user: 'billy@sentry.io',
      user_id: '1',
    });
  });

  it('is unique across id and environment', async function () {
    freight.emit('started', {
      ...payload,
      deploy_number: 1,
      status: 'started',
    });

    await tick();
    await tick();
    await tick();
    // @ts-ignore
    expect(await dbMock('deploys').select('*')).toHaveLength(1);

    // Different environment, should be ok
    freight.emit('started', {
      ...payload,
      deploy_number: 1,
      status: 'started',
      environment: 'staging',
    });
    await tick();
    await tick();
    await tick();
    // @ts-ignore
    expect(await dbMock('deploys').select('*')).toHaveLength(2);

    freight.emit('started', {
      ...payload,
      deploy_number: 1,
      status: 'finished',
      environment: 'staging',
    });
    await tick();
    await tick();
    await tick();
    // @ts-ignore
    const result = await dbMock('deploys')
      .where({ environment: 'staging' })
      .first('*');
    expect(result.status).toBe('finished');
  });
});
