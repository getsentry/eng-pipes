import { createAppAuth } from '@octokit/auth-app';

import { GETSENTRY_ORG } from '@/config';
import { OctokitWithRetries as octokitClass } from '@api/github/octokitWithRetries';

import { GitHubOrg } from './org';

describe('constructor', function () {
  beforeAll(async function () {
    octokitClass.mockClear();
    await new GitHubOrg({
      appAuth: { appId: 'cheese please', privateKey: 'yes' },
    });
  });

  it('is instantiated once', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('is instantiated with appAuth', async function () {
    expect(octokitClass).toHaveBeenCalledWith({
      auth: { appId: 'cheese please', privateKey: 'yes' },
      authStrategy: createAppAuth,
    });
  });

  it('does not try to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(0);
  });
});

describe('bindAPI', function () {
  beforeAll(async function () {
    const org = await new GitHubOrg({
      slug: 'banana',
      appAuth: {
        appId: 422,
        privateKey: 'so private',
      },
    });
    octokitClass.mockClear();
    org.bindAPI();
  });

  it('is instantiated once again', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('tries to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(1);
  });

  it('is instantiated the second time with authStrategy and auth', async function () {
    expect(octokitClass).toHaveBeenLastCalledWith({
      authStrategy: createAppAuth,
      auth: {
        appId: 422,
        privateKey: 'so private',
        installationId: 'installation-banana',
      },
    });
  });
});
