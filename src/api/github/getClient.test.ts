import { createAppAuth } from '@octokit/auth-app';

import { GETSENTRY_ORG } from '@/config';
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

describe('getClient(ClientType.App, GETSENTRY_ORG.slug)', function () {
  it('returns GETSENTRY_ORG.api', async function () {
    const octokit = await getClient(ClientType.App, GETSENTRY_ORG.slug);
    expect(octokit).toBe(GETSENTRY_ORG.api);
  });
});
