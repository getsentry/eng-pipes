// Magic incantation. I don't have time to get to the bottom of this, but for
// some reason the following two lines allow the import machinery to function
// as desired. Without this, loadGitHubOrgs is undefined in config/index.ts.
import { DRY_RUN } from '.'; // random simple envvar
DRY_RUN; // Yes, this is necessary. 🧙

import { loadGitHubOrgs } from './loadGitHubOrgs';

describe('loadGitHubOrgs', function () {
  it('basically works', async function () {
    const orgs = loadGitHubOrgs({
      GH_ORGS_YML: 'test/github-orgs.good.yml',
      GH_KEY_BLAH: '--------begin----end-----------',
    });
    expect(orgs.get('zer-ner').appAuth.appId).toEqual(53); // tests type conversion
    expect(orgs.get('hurple').appAuth.appId).toEqual(42);
  });

  it('loads the main github-orgs.yml in a prod simulation', async function () {
    const org = loadGitHubOrgs({
      GH_APP_PRIVATE_KEY_FOR_GETSENTRY: 'cheese',
      // GH_ORGS_YML - not set in prod
    }).get('getsentry');
    expect(org.appAuth).toEqual({
      appId: 66573,
      privateKey: 'cheese',
      installationId: 9303463,
    });

    // Spot-check repos for good measure.
    expect(org.repos.withRouting).toEqual(['sentry', 'sentry-docs']);
  });

  it('chokes on non-numeric appId', async function () {
    expect(() => {
      loadGitHubOrgs({
        GH_ORGS_YML: 'test/github-orgs.bad.yml',
      });
    }).toThrow("appId 'hoofle' is not a number");
  });

  it('chokes on a missing file', async function () {
    expect(() => {
      loadGitHubOrgs({
        GH_ORGS_YML: 'test/nope-no-file-here-nada-zippo-zilch.yml',
      });
    }).toThrow(
      "ENOENT: no such file or directory, open 'test/nope-no-file-here-nada-zippo-zilch.yml'"
    );
  });
});
