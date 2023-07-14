import { GH_APPS } from '@/config';

describe('GH_APPS', function () {
  it('get errors out for unknown org', function () {
    expect(() => GH_APPS.get('CheezWhiz')).toThrow(
      "No app is registered for 'CheezWhiz'",
      ''
    );
  });

  it.each([
    ['bad payload', {}, "Could not find an org in 'undefined' or 'undefined'."],
    [
      'bad payload.organization',
      { organization: {} },
      "Could not find an org in '{}' or 'undefined'.",
    ],
    [
      'unknown org in payload.organization',
      { organization: { login: 'foo' } },
      "No app is registered for 'foo'.",
    ],
    [
      'bad payload.repository',
      { repository: {} },
      "Could not find an org in 'undefined' or 'undefined'.",
    ],
    [
      'bad payload.repository.owner',
      { repository: { owner: {} } },
      "Could not find an org in 'undefined' or '{}'.",
    ],

    [
      'user as payload.repository.owner',
      { repository: { owner: { login: 'foo', type: 'User' } } },
      'Could not find an org in \'undefined\' or \'{\n  "login": "foo",\n  "type": "User"\n}\'.',
    ],
    [
      'unknown org in payload.repository.owner',
      { repository: { owner: { login: 'foo', type: 'Organization' } } },
      "No app is registered for 'foo'.",
    ],
  ])('getForPayload errors out for %s', (description, payload, error) => {
    expect(() => GH_APPS.getForPayload(payload)).toThrow(error);
  });
});
