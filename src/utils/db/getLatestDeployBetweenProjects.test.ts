import payload from '@test/payloads/freight.json';

import { deployState } from '@/brain/deployState';
import { freight } from '@api/freight';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import { db } from '@utils/db';

import { getLatestDeployBetweenProjects } from './getLatestDeployBetweenProjects';

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('getLatestDeployBetweenProjects', function () {
  let octokit;

  beforeAll(async function () {
    await db.migrate.latest();
    octokit = await getClient(ClientType.App, 'getsentry');
    deployState();
  });

  afterAll(async function () {
    await db.destroy();
  });

  beforeEach(async function () {});

  afterEach(async function () {
    await db('deploys').delete();
    octokit.repos.compareCommits.mockClear();
  });

  it('projectA is older than projectB', async function () {
    // projectA
    freight.emit('finished', {
      ...payload,
      status: 'finished',
      deploy_number: 100,
      sha: '1',
    });
    // projectB
    freight.emit('finished', {
      ...payload,
      sha: '9',
      deploy_number: 101,
      status: 'finished',
      app_name: 'getsentry-frontend',
    });

    await tick();
    await tick();

    expect(await getLatestDeployBetweenProjects()).toMatchObject({
      sha: '9',
    });
  });

  it('projectA is newer than projectB', async function () {
    // projectA
    freight.emit('finished', {
      ...payload,
      status: 'finished',
      deploy_number: 200,
      sha: '9',
    });
    // projectB
    freight.emit('finished', {
      ...payload,
      sha: '1',
      deploy_number: 201,
      status: 'finished',
      app_name: 'getsentry-frontend',
    });

    await tick();
    await tick();

    expect(await getLatestDeployBetweenProjects()).toMatchObject({
      sha: '9',
    });
  });
});
