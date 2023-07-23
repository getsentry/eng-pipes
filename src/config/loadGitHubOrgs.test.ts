// Order of imports matters here, and the linter will change the order if we're
// not careful.
import { GETSENTRY_ORG } from './index';
import { loadGitHubOrgs } from './loadGitHubOrgs';

describe('loadGitHubOrgs', function () {
  it('basically works', async function () {
    const expected = {
      orgs: new Map([
        [
          'getsentry',
          {
            slug: 'getsentry',
            appAuth: {
              appId: 66573,
              privateKey: "No key found in 'GH_APP_PRIVATE_KEY_FOR_GETSENTRY'",
              installationId: undefined,
            },
            project: {
              nodeId: 'PVT_kwDOABVQ184AOGW8',
              fieldIds: {
                productArea: 'PVTSSF_lADOABVQ184AOGW8zgJEBno',
                status: 'PVTSSF_lADOABVQ184AOGW8zgI_7g0',
                responseDue: 'PVTF_lADOABVQ184AOGW8zgLLxGg',
              },
            },
            api: GETSENTRY_ORG.api,
          },
        ],
      ]),
    };
    const actual = loadGitHubOrgs({});
    expect(actual).toEqual(expected);
  });

  it('mixes in a key from the environment', async function () {
    const actual = loadGitHubOrgs({
      GH_APP_PRIVATE_KEY_FOR_GETSENTRY: 'cheese',
    }).get('getsentry').appAuth.privateKey;
    expect(actual).toEqual('cheese');
  });

  it('layers in local config', async function () {
    const orgs = loadGitHubOrgs({}, 'test/github-orgs.good.yml');
    expect(orgs.get('zer-ner').appAuth.appId).toEqual(53); // tests type conversion
    expect(orgs.get('getsentry').appAuth.appId).toEqual(42);
  });

  it('chokes on non-numeric appId', async function () {
    expect(() => {
      loadGitHubOrgs({}, 'test/github-orgs.bad.yml');
    }).toThrow("appId 'hoofle' is not a number");
  });
});
