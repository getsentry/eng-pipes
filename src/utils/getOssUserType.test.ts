import { makeUserTokenClient } from '@api/github';

import { getOssUserType } from './getOssUserType';

describe('getUserOssType', function () {
  let octokit;
  const repository = {
    owner: {
      type: 'Organization',
      login: 'getsentry',
    },
  };

  beforeAll(async function () {
    octokit = makeUserTokenClient();
  });
  beforeEach(function () {
    octokit.orgs.checkMembershipForUser.mockClear();
    octokit.request.mockClear();
  });

  it('caches membership result', async function () {
    let result;

    result = await getOssUserType({
      sender: {
        login: 'Picard',
      },
      repository,
    });

    expect(result).toBe('internal');
    expect(octokit.orgs.checkMembershipForUser).toHaveBeenCalledTimes(1);
    octokit.orgs.checkMembershipForUser.mockClear();
    octokit.request.mockClear();

    // Check same user
    result = await getOssUserType({
      sender: {
        login: 'Picard',
      },
      repository,
    });
    expect(result).toBe('internal');
    expect(octokit.orgs.checkMembershipForUser).toHaveBeenCalledTimes(0);
    octokit.orgs.checkMembershipForUser.mockClear();
    octokit.request.mockClear();

    // Different user
    result = await getOssUserType({
      sender: {
        login: 'Skywalker',
      },
      repository,
    });
    expect(result).toBe('external');
    expect(octokit.orgs.checkMembershipForUser).toHaveBeenCalledTimes(1);
  });

  it('differentiates gtm', async function () {
    const result = await getOssUserType({
      sender: {
        login: 'Troi',
      },
      repository,
    });

    expect(result).toBe('gtm');
    expect(octokit.orgs.checkMembershipForUser).toHaveBeenCalledTimes(1);
    expect(octokit.request).toHaveBeenCalledTimes(1);
  });

  it('checks for expired cache', async function () {
    const now = Date.now();
    let result;

    // Note cache persists between tests
    result = await getOssUserType({
      sender: {
        login: 'Solo',
      },
      repository,
    });
    expect(octokit.orgs.checkMembershipForUser).toHaveBeenCalledTimes(1);
    octokit.orgs.checkMembershipForUser.mockClear();

    // Time-travel 2 weeks in the future
    jest.spyOn(global.Date, 'now').mockImplementation(() => now + 1210000000);

    // Check same user
    result = await getOssUserType({
      sender: {
        login: 'Solo',
      },
      repository,
    });
    expect(result).toBe('external');
    expect(octokit.orgs.checkMembershipForUser).toHaveBeenCalledTimes(1);
  });
});
