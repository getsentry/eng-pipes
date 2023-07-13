import { loadGitHubAppsFromEnvironment } from './loadGitHubAppsFromEnvironment';

describe('loadGitHubAppsFromEnvironment ', function () {
  it('basically works', async function () {
    const expected = {
      apps: new Map([
        [
          'Enterprise',
          {
            num: 1,
            org: 'Enterprise',
            auth: {
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
          },
        ],
      ]),
    };
    const actual = loadGitHubAppsFromEnvironment({
      GH_APP_1_ORG_SLUG: 'Enterprise',
      GH_APP_1_IDENTIFIER: '42',
      GH_APP_1_SECRET_KEY: 'cheese',
      GH_APP_1_ISSUES_PROJECT_NODE_ID: 'bread',
      GH_APP_1_PRODUCT_AREA_FIELD_ID: 'wine',
      GH_APP_1_STATUS_FIELD_ID: 'beer',
      GH_APP_1_RESPONSE_DUE_DATE_FIELD_ID: 'olives',
    });
    expect(actual).toEqual(expected);
  });

  it('ignores the rest of the environment', async function () {
    const actual = loadGitHubAppsFromEnvironment({
      RANDOM: 'garbage',
      AND_EXTRA: 'stuff',

      GH_APP_1_ORG_SLUG: 'Enterprise',
      GH_APP_1_IDENTIFIER: '42',
      GH_APP_1_SECRET_KEY: 'cheese',
      GH_APP_1_ISSUES_PROJECT_NODE_ID: 'bread',
      GH_APP_1_PRODUCT_AREA_FIELD_ID: 'wine',
      GH_APP_1_STATUS_FIELD_ID: 'beer',
      GH_APP_1_RESPONSE_DUE_DATE_FIELD_ID: 'olives',
    }).get('Enterprise').auth.appId;
    expect(actual).toEqual(42);
  });

  it('is fine with no app configured', async function () {
    const actual = loadGitHubAppsFromEnvironment({
      RANDOM: 'garbage',
      AND_EXTRA: 'stuff',
    });
    expect(actual).toEqual({ apps: new Map() });
  });

  it('errors out on partial config', async function () {
    const t = () => {
      loadGitHubAppsFromEnvironment({
        GH_APP_1_ORG_SLUG: 'Enterprise',
        GH_APP_1_IDENTIFIER: '42',
        GH_APP_1_SECRET_KEY: 'cheese',
        GH_APP_1_ISSUES_PROJECT_NODE_ID: '', // empty still fails
      });
    };
    expect(t).toThrow(Error);
    expect(t).toThrow(
      'Config missing: {"1":["project.node_id","project.product_area_field_id","project.status_field_id","project.response_due_date_field_id"]}'
    );
  });
});
