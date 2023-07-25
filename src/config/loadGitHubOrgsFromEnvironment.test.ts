import { loadGitHubOrgsFromEnvironment } from './loadGitHubOrgsFromEnvironment';
import { GETSENTRY_ORG } from '.';

describe('loadGitHubOrgsFromEnvironment ', function () {
  it('basically works', async function () {
    const expected = {
      orgs: new Map([
        [
          'getsentry',
          {
            slug: 'getsentry',
            appAuth: {
              appId: 42,
              privateKey: 'cheese',
              installationId: undefined,
            },
            project: {
              node_id: 'bread',
              product_area_field_id: 'wine',
              status_field_id: 'beer',
              response_due_date_field_id: 'olives',
            },
            api: GETSENTRY_ORG.api,
          },
        ],
      ]),
    };
    const actual = loadGitHubOrgsFromEnvironment({
      GH_USER_TOKEN: 'onions',
      GH_APP_IDENTIFIER: '42',
      GH_APP_SECRET_KEY: 'cheese',
      ISSUES_PROJECT_NODE_ID: 'bread',
      PRODUCT_AREA_FIELD_ID: 'wine',
      STATUS_FIELD_ID: 'beer',
      RESPONSE_DUE_DATE_FIELD_ID: 'olives',
    });
    expect(actual).toEqual(expected);
  });

  it('ignores the rest of the environment', async function () {
    const actual = loadGitHubOrgsFromEnvironment({
      RANDOM: 'garbage',
      AND_EXTRA: 'stuff',

      GH_USER_TOKEN: 'onions',
      GH_APP_IDENTIFIER: '42',
      GH_APP_SECRET_KEY: 'cheese',
    }).get('getsentry').appAuth.appId;
    expect(actual).toEqual(42);
  });

  it('is fine with no org configured', async function () {
    const actual = loadGitHubOrgsFromEnvironment({
      RANDOM: 'garbage',
      AND_EXTRA: 'stuff',
    });
    expect(actual).toEqual({ orgs: new Map() });
  });

  it('loads defaults for project board if auth is present', async function () {
    const expected = {
      orgs: new Map([
        [
          'getsentry',
          {
            slug: 'getsentry',
            appAuth: {
              appId: 42,
              privateKey: 'cheese',
              installationId: undefined,
            },
            project: {
              node_id: 'PVT_kwDOABVQ184AOGW8',
              product_area_field_id: 'PVTSSF_lADOABVQ184AOGW8zgJEBno',
              status_field_id: 'PVTSSF_lADOABVQ184AOGW8zgI_7g0',
              response_due_date_field_id: 'PVTF_lADOABVQ184AOGW8zgLLxGg',
            },
            api: GETSENTRY_ORG.api,
          },
        ],
      ]),
    };
    const actual = loadGitHubOrgsFromEnvironment({
      GH_USER_TOKEN: 'onions',
      GH_APP_IDENTIFIER: '42',
      GH_APP_SECRET_KEY: 'cheese',
    });
    expect(actual).toEqual(expected);
  });
});
