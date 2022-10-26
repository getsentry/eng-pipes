import buildingPayload from '@test/payloads/gocd/gocd-stage-building.json';
import failedPayload from '@test/payloads/gocd/gocd-stage-failed.json';

import { gocdevents } from '@api/gocdevents';
import * as utils from '@utils/db';

import * as saveGoCDStageEvents from '.';

const DB_NAME = 'gocd-stages';

describe('saveGoCDStageEvents.handler', function () {
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
    await utils.db(DB_NAME).delete();
  });

  it('saves and updates stage to database', async function () {
    await saveGoCDStageEvents.handler(buildingPayload);

    expect(dbMock).toHaveBeenCalledTimes(2);

    let stages = await dbMock(DB_NAME).select('*');
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({
      pipeline_build_cause: [
        {
          changed: false,
          material: {
            'git-configuration': {
              branch: 'master',
              'shallow-clone': false,
              url: 'git@github.com:getsentry/getsentry.git',
            },
            type: 'git',
          },
          modifications: [
            {
              data: {},
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              revision: '2b0034becc4ab26b985f4c1a08ab068f153c274c',
            },
          ],
        },
        {
          changed: false,
          material: {
            'git-configuration': {
              branch: 'master',
              'shallow-clone': false,
              url: 'git@github.com:getsentry/sentry.git',
            },
            type: 'git',
          },
          modifications: [
            {
              data: {},
              'modified-time': 'Oct 26, 2022, 5:56:18 PM',
              revision: '77b189ad3b4b48a7eb1ec63cc486cdc991332352',
            },
          ],
        },
      ],
      pipeline_counter: '20',
      pipeline_group: 'sentryio',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      pipeline_name: 'getsentry_frontend',
      stage_approval_type: 'success',
      stage_approved_by: 'matt.gaunt@sentry.io',
      stage_counter: '1',
      stage_create_time: new Date('2022-10-26T17:57:53.000Z'),
      stage_jobs: [
        {
          name: 'preliminary-checks',
          result: 'Unknown',
          state: 'Scheduled',
        },
      ],
      stage_last_transition_time: null,
      stage_name: 'preliminary-checks',
      stage_result: 'Unknown',
      stage_state: 'Building',
    });

    dbMock.mockClear();

    await saveGoCDStageEvents.handler(failedPayload);

    expect(dbMock).toHaveBeenCalledTimes(2);

    stages = await dbMock(DB_NAME).select('*');
    expect(stages).toHaveLength(1);

    expect(stages[0]).toMatchObject({
      pipeline_build_cause: [
        {
          changed: false,
          material: {
            'git-configuration': {
              branch: 'master',
              'shallow-clone': false,
              url: 'git@github.com:getsentry/getsentry.git',
            },
            type: 'git',
          },
          modifications: [
            {
              data: {},
              'modified-time': 'Oct 26, 2022, 5:05:17 PM',
              revision: '2b0034becc4ab26b985f4c1a08ab068f153c274c',
            },
          ],
        },
        {
          changed: false,
          material: {
            'git-configuration': {
              branch: 'master',
              'shallow-clone': false,
              url: 'git@github.com:getsentry/sentry.git',
            },
            type: 'git',
          },
          modifications: [
            {
              data: {},
              'modified-time': 'Oct 26, 2022, 5:56:18 PM',
              revision: '77b189ad3b4b48a7eb1ec63cc486cdc991332352',
            },
          ],
        },
      ],
      pipeline_counter: '20',
      pipeline_group: 'sentryio',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      pipeline_name: 'getsentry_frontend',
      stage_approval_type: 'manual',
      stage_approved_by: 'matt.gaunt@sentry.io',
      stage_counter: '1',
      stage_create_time: new Date('2022-10-26T17:58:42.000Z'),
      stage_jobs: [
        {
          name: 'deploy_static',
          result: 'Failed',
          state: 'Completed',
        },
      ],
      stage_last_transition_time: new Date('2022-10-26T17:58:47.000Z'),
      stage_name: 'deploy_frontend',
      stage_result: 'Failed',
      stage_state: 'Failed',
    });
  });
});

describe('saveGoCDStageEvents.saveGoCDStageEvents', function () {
  let eventEmitterSpy;

  beforeEach(async function () {
    eventEmitterSpy = jest.spyOn(gocdevents, 'on');
  });

  afterEach(async function () {
    eventEmitterSpy.mockRestore();
  });

  it('process event', function () {
    saveGoCDStageEvents.saveGoCDStageEvents();
    expect(eventEmitterSpy).toHaveBeenCalledTimes(1);
    expect(eventEmitterSpy).toHaveBeenCalledWith(
      'stage',
      saveGoCDStageEvents.handler
    );
  });
});
