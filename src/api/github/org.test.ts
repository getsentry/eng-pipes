import { createAppAuth } from '@octokit/auth-app';

import { GETSENTRY_ORG } from '@/config';
import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import { OctokitWithRetries as octokitClass } from '@api/github/octokitWithRetries';

import { GitHubOrg } from './org';

describe('constructor', function () {
  beforeAll(async function () {
    octokitClass.mockClear();
    await new GitHubOrg('cheese please', {});
  });

  it('is instantiated once', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('is instantiated with userToken', async function () {
    expect(octokitClass).toHaveBeenCalledWith({ auth: 'cheese please' });
  });

  it('does not try to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(0);
  });
});

describe('bindAPI', function () {
  beforeAll(async function () {
    const org = await new GitHubOrg('cheese please', {
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
