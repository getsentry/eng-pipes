import { createAppAuth } from '@octokit/auth-app';

import { ClientType } from '@api/github/clientType';
import { getClient } from '@api/github/getClient';
import { OctokitWithRetries as octokitClass } from '@api/github/octokitWithRetries';

describe('getClient(ClientType.User)', function () {
  beforeAll(async function () {
    octokitClass.mockClear();
    await getClient(ClientType.User);
  });

  it('is instantiated once', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('is instantiated with GH_USER_TOKEN', async function () {
    expect(octokitClass).toHaveBeenCalledWith({ auth: 'ghp_BLAHBLAHBLAH' });
  });

  it('does not try to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(0);
  });
});

describe("getClient(ClientType.App, 'getsentry')", function () {
  beforeAll(async function () {
    octokitClass.mockClear();
    await getClient(ClientType.App, 'getsentry');
  });

  it('is instantiated twice', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(2);
  });

  it('tries to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(1);
  });

  it('is instantiated the second time with authStrategy and auth', async function () {
    expect(octokitClass).toHaveBeenLastCalledWith({
      authStrategy: createAppAuth,
      auth: {
        appId: 1234,
        privateKey: 'top \nsecret\n key',
        installationId: 'installation-getsentry',
      },
    });
  });
});
