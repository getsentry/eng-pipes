import { loadGitHubAppsFromEnvironment } from './loadGitHubAppsFromEnvironment';

describe('loadGitHubAppsFromEnvironment ', function () {
  it('basically works', async function () {
    const expected = new Map([
      [
        '__tmp_org_placeholder__',
        {
          appId: 42,
          privateKey: 'cheese',
          installationId: undefined,
        },
      ],
    ]);
    const actual = loadGitHubAppsFromEnvironment({
      GH_APP_IDENTIFIER: '42',
      GH_APP_SECRET_KEY: 'cheese',
    });
    expect(actual).toEqual(expected);
  });

  it('ignores the rest of the environment', async function () {
    const actual = loadGitHubAppsFromEnvironment({
      RANDOM: 'garbage',
      AND_EXTRA: 'stuff',

      GH_APP_IDENTIFIER: '42',
      GH_APP_SECRET_KEY: 'cheese',
    }).get('__tmp_org_placeholder__').appId;
    expect(actual).toEqual(42);
  });

  it('is fine with no app configured', async function () {
    const actual = loadGitHubAppsFromEnvironment({
      RANDOM: 'garbage',
      AND_EXTRA: 'stuff',
    });
    expect(actual).toEqual(new Map());
  });
});
