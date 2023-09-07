import { GH_ORGS, PRODUCT_OWNERS_YML } from '@/config';

export function getTeams(
  repo: string,
  productArea: string,
  org: string
): string[] {
  const orgObj = GH_ORGS.get(org);
  if (orgObj.repos.withoutRouting.includes(`${repo}`)) {
    return [PRODUCT_OWNERS_YML['repos'][repo]];
  }
  if (orgObj.repos.withRouting.includes(`${repo}`)) {
    if (productArea) {
      return PRODUCT_OWNERS_YML['product_areas'][productArea];
    }
  }
  return [];
}
