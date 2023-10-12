import * as Sentry from '@sentry/node';

import { GH_ORGS, PRODUCT_OWNERS_INFO } from '~/src/config';

export function getTeams(
  repo: string,
  org: string,
  productArea?: string
): string[] {
  const orgObj = GH_ORGS.get(org);
  // TODO(team-ospo/issues#200): include codecov
  if (org === 'codecov') {
    return [];
  }
  if (orgObj.repos.withoutRouting.includes(`${repo}`)) {
    if (!PRODUCT_OWNERS_INFO['repos'][repo]) {
      Sentry.captureMessage(`Teams is not defined for ${org}/${repo}`);
      return ['team-ospo'];
    }
    return [PRODUCT_OWNERS_INFO['repos'][repo]];
  }
  if (orgObj.repos.withRouting.includes(`${repo}`)) {
    if (productArea) {
      if (!PRODUCT_OWNERS_INFO['product_areas'][productArea]) {
        Sentry.captureMessage(`Teams is not defined for ${productArea}`);
        return ['team-ospo'];
      }
      return PRODUCT_OWNERS_INFO['product_areas'][productArea];
    }
  }
  return ['team-ospo'];
}
