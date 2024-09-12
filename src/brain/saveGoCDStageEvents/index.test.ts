import merge from 'lodash.merge';

import buildingPayload from '@test/payloads/gocd/gocd-stage-building.json';
import failedPayload from '@test/payloads/gocd/gocd-stage-failed.json';

import { gocdevents } from '@/init/gocdevents';
import * as utils from '@utils/db';

import * as saveGoCDStageEvents from '.';

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
    await utils.db(saveGoCDStageEvents.DB_TABLE_STAGES).delete();
    await utils.db(saveGoCDStageEvents.DB_TABLE_MATERIALS).delete();
  });

  it('saves and updates stage to database', async function () {
    await saveGoCDStageEvents.handler(buildingPayload);

    // 1x Check if pipeline exists
    // 1x Insert pipeline
    // 1x Insert materials and revision
    expect(dbMock).toHaveBeenCalledTimes(3);

    let stages = await dbMock(saveGoCDStageEvents.DB_TABLE_STAGES).select('*');
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
      pipeline_counter: 20,
      pipeline_group: 'sentryio',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      pipeline_name: 'getsentry_frontend',
      stage_approval_type: 'success',
      stage_approved_by: 'matt.gaunt@sentry.io',
      stage_counter: 1,
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

    const materials = await dbMock(saveGoCDStageEvents.DB_TABLE_MATERIALS)
      .select('*')
      .orderBy('url', 'asc');
    expect(materials).toHaveLength(2);
    expect(materials[0]).toMatchObject({
      stage_material_id:
        'sentryio_getsentry_frontend_20_git@github.com:getsentry/getsentry.git_2b0034becc4ab26b985f4c1a08ab068f153c274c',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      url: 'git@github.com:getsentry/getsentry.git',
      branch: 'master',
      revision: '2b0034becc4ab26b985f4c1a08ab068f153c274c',
    });
    expect(materials[1]).toMatchObject({
      stage_material_id:
        'sentryio_getsentry_frontend_20_git@github.com:getsentry/sentry.git_77b189ad3b4b48a7eb1ec63cc486cdc991332352',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      url: 'git@github.com:getsentry/sentry.git',
      branch: 'master',
      revision: '77b189ad3b4b48a7eb1ec63cc486cdc991332352',
    });

    dbMock.mockClear();

    await saveGoCDStageEvents.handler(failedPayload);

    expect(dbMock).toHaveBeenCalledTimes(2);

    stages = await dbMock(saveGoCDStageEvents.DB_TABLE_STAGES).select('*');
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
      pipeline_counter: 20,
      pipeline_group: 'sentryio',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      pipeline_name: 'getsentry_frontend',
      stage_approval_type: 'manual',
      stage_approved_by: 'matt.gaunt@sentry.io',
      stage_counter: 1,
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

  it('saves just the git materials', async function () {
    let payload = merge({}, buildingPayload);
    delete payload.data.pipeline['build-cause'];
    payload = merge(payload, {
      data: {
        pipeline: {
          'build-cause': [
            {
              material: {
                'git-configuration': {
                  'shallow-clone': false,
                  branch: 'master',
                  url: 'git@github.com:getsentry/getsentry.git',
                },
                type: 'git',
              },
              changed: false,
              modifications: [
                {
                  revision: '2b0034becc4ab26b985f4c1a08ab068f153c274c',
                  'modified-time': 'Oct 26, 2022, 5:05:17 PM',
                  data: {},
                },
              ],
            },
            {
              material: {
                'git-configuration': {
                  'shallow-clone': false,
                  branch: 'master',
                  url: 'git@github.com:getsentry/sentry.git',
                },
                type: 'git',
              },
              changed: false,
              modifications: [],
            },
            {
              material: {
                type: 'pipeline',
              },
              changed: false,
            },
          ],
        },
      },
    });

    await saveGoCDStageEvents.handler(payload);

    // 1x Check if pipeline exists
    // 1x Insert pipeline
    // 1x Insert materials and revision
    expect(dbMock).toHaveBeenCalledTimes(3);

    let stages = await dbMock(saveGoCDStageEvents.DB_TABLE_STAGES).select('*');
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
          material: {
            'git-configuration': {
              'shallow-clone': false,
              branch: 'master',
              url: 'git@github.com:getsentry/sentry.git',
            },
            type: 'git',
          },
          changed: false,
          modifications: [],
        },
        {
          material: {
            type: 'pipeline',
          },
          changed: false,
        },
      ],
      pipeline_counter: 20,
      pipeline_group: 'sentryio',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      pipeline_name: 'getsentry_frontend',
      stage_approval_type: 'success',
      stage_approved_by: 'matt.gaunt@sentry.io',
      stage_counter: 1,
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

    const materials = await dbMock(saveGoCDStageEvents.DB_TABLE_MATERIALS)
      .select('*')
      .orderBy('url', 'asc');
    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({
      stage_material_id:
        'sentryio_getsentry_frontend_20_git@github.com:getsentry/getsentry.git_2b0034becc4ab26b985f4c1a08ab068f153c274c',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      url: 'git@github.com:getsentry/getsentry.git',
      branch: 'master',
      revision: '2b0034becc4ab26b985f4c1a08ab068f153c274c',
    });

    dbMock.mockClear();

    await saveGoCDStageEvents.handler(failedPayload);

    expect(dbMock).toHaveBeenCalledTimes(2);

    stages = await dbMock(saveGoCDStageEvents.DB_TABLE_STAGES).select('*');
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
      pipeline_counter: 20,
      pipeline_group: 'sentryio',
      pipeline_id: 'sentryio_getsentry_frontend_20',
      pipeline_name: 'getsentry_frontend',
      stage_approval_type: 'manual',
      stage_approved_by: 'matt.gaunt@sentry.io',
      stage_counter: 1,
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

  it('only save pipeline if there are no git materials', async function () {
    const payload = merge({}, buildingPayload);
    payload.data.pipeline['build-cause'] = [];

    await saveGoCDStageEvents.handler(payload);

    // 1x Check if pipeline exists
    // 1x Insert pipeline
    // 0x Insert materials and revision
    expect(dbMock).toHaveBeenCalledTimes(2);
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
