import payload from '@test/payloads/freight.json';

import { freight } from '@api/freight';
import * as utils from '@utils/db';

import { deployState, handler } from '.';

describe('deployState.handler', function () {
  let dbMock: jest.SpyInstance;

  beforeAll(async function () {
    await utils.db.migrate.latest();
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
    await handler({
      ...payload,
      status: 'queued',
      date_started: null,
      date_finished: null,
      duration: null,
    });

    expect(dbMock).toHaveBeenCalledTimes(2);

    // @ts-ignore
    let deploys = await dbMock('deploys').select('*');
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toMatchObject({
      app_name: 'getsentry-backend',
      created_at: new Date('2020-05-13T23:43:52.000Z'),
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

    await handler({
      ...payload,
      status: 'started',
      date_finished: null,
      duration: null,
    });

    expect(dbMock).toHaveBeenCalledTimes(2);
    // @ts-ignore
    deploys = await dbMock('deploys').select('*');
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toMatchObject({
      app_name: 'getsentry-backend',
      created_at: new Date('2020-05-13T23:43:52.000Z'),
      duration: null,
      environment: 'production',
      external_id: '13',
      finished_at: null,
      previous_sha: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
      ref: 'master',
      sha: 'c88d886ba52bd85431052abaef4916469f7db2e8',
      started_at: new Date('2020-05-13T23:43:52.000Z'),
      status: 'started',
      user: 'billy@sentry.io',
      user_id: '1',
    });

    dbMock.mockClear();

    await handler({
      ...payload,
      status: 'finished',
    });

    expect(dbMock).toHaveBeenCalledTimes(2);

    // @ts-ignore
    deploys = await dbMock('deploys').select('*');
    expect(deploys).toHaveLength(1);
    expect(deploys[0]).toMatchObject({
      app_name: 'getsentry-backend',
      created_at: new Date('2020-05-13T23:43:52.000Z'),
      duration: 600,
      environment: 'production',
      external_id: '13',
      finished_at: new Date('2020-05-15T20:59:02.000Z'),
      previous_sha: 'ab2e85f1e52c38cf138bbc60f8a72b7ab282b02f',
      ref: 'master',
      sha: 'c88d886ba52bd85431052abaef4916469f7db2e8',
      started_at: new Date('2020-05-13T23:43:52.000Z'),
      status: 'finished',
      user: 'billy@sentry.io',
      user_id: '1',
    });
  });

  it('is unique across id and environment', async function () {
    await handler({
      ...payload,
      deploy_number: 1,
      status: 'started',
    });

    // @ts-ignore
    expect(await dbMock('deploys').select('*')).toHaveLength(1);

    // Different environment, should be ok
    await handler({
      ...payload,
      deploy_number: 1,
      status: 'started',
      environment: 'staging',
    });

    // @ts-ignore
    expect(await dbMock('deploys').select('*')).toHaveLength(2);

    await handler({
      ...payload,
      deploy_number: 1,
      status: 'finished',
      environment: 'staging',
    });

    // @ts-ignore
    const result = await dbMock('deploys')
      .where({ environment: 'staging' })
      .first('*');
    expect(result.status).toBe('finished');
  });
});

describe('deployState.deployState', function () {
  let eventEmitterSpy;

  beforeEach(async function () {
    eventEmitterSpy = jest.spyOn(freight, 'on');
  });

  afterEach(async function () {
    eventEmitterSpy.mockRestore();
  });

  it('process event', function () {
    deployState();
    expect(eventEmitterSpy).toHaveBeenCalledTimes(1);
    expect(eventEmitterSpy).toHaveBeenCalledWith('*', handler);
  });
});
