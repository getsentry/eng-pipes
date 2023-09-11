import * as Sentry from '@sentry/node';

import { GH_ORGS, PRODUCT_OWNERS_YML } from '@/config';

export function getTeams(
  repo: string,
  productArea: string,
  org: string
): string[] {
  const orgObj = GH_ORGS.get(org);
  // TODO: include codecov
  if (org === 'codecov') {
    return [];
  }
  if (orgObj.repos.withoutRouting.includes(`${repo}`)) {
    if (!PRODUCT_OWNERS_YML['repos'][repo]) {
      Sentry.captureMessage(`Teams is not defined for ${org}/${repo}`);
      return [];
    }
    return [PRODUCT_OWNERS_YML['repos'][repo]];
  }
  if (orgObj.repos.withRouting.includes(`${repo}`)) {
    if (productArea) {
      if (!PRODUCT_OWNERS_YML['product_areas'][productArea]) {
        Sentry.captureMessage(`Teams is not defined for ${productArea}`);
        return [];
      }
      return PRODUCT_OWNERS_YML['product_areas'][productArea];
    }
  }
  return [];
}
