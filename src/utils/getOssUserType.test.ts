import { ClientType, getClient } from '@api/github/getClient';

import { getOssUserType } from './getOssUserType';

describe('getUserOssType', function () {
  let octokit;
  const repository = {
    owner: {
      type: 'Organization',
      login: 'Enterprise',
    },
  };

  beforeAll(async function () {
    octokit = await getClient(ClientType.App, 'Enterprise');
  });
  beforeEach(function () {
    octokit.orgs.checkMembershipForUser.mockClear();
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

  it('checks for expired cache', async function () {
    const now = Date.now();
    let result;

    // Note cache persists between tests
    result = await getOssUserType({
      sender: {
        login: 'Picard2',
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
        login: 'Picard2',
      },
      repository,
    });
    expect(result).toBe('external');
    expect(octokit.orgs.checkMembershipForUser).toHaveBeenCalledTimes(1);
  });
});
