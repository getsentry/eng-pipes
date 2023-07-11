import { loadGitHubApps } from './loadGitHubApps.ts';

describe('loadGitHubApps', function () {
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
    const actual = loadGitHubApps({
      GH_APP_IDENTIFIER: '42',
      GH_APP_SECRET_KEY: 'cheese',
    });
    expect(actual).toEqual(expected);
  });
});
