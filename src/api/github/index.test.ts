import { makeUserTokenClient } from '@api/github';
import { OctokitWithRetries as octokitClass } from '@api/github/octokitWithRetries';

describe('makeUserTokenClient', function () {
  beforeAll(async function () {
    octokitClass.mockClear();
    makeUserTokenClient();
  });

  it('is instantiated once', async function () {
    expect(octokitClass).toHaveBeenCalledTimes(1);
  });

  it('is instantiated with GH_USER_TOKEN by default', async function () {
    expect(octokitClass).toHaveBeenCalledWith({ auth: 'ghp_BLAHBLAHBLAH' });
  });

  it('does not try to get an org installation', async function () {
    expect(octokitClass.apps.getOrgInstallation).toHaveBeenCalledTimes(0);
  });
});

describe('error handling', function () {
  it('throws an error for no token', async function () {
    expect(() => {
      makeUserTokenClient('');
    }).toThrow('No token. Try setting GH_USER_TOKEN.');
  });
});
