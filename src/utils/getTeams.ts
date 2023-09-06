import { PRODUCT_OWNERS_YML, GH_ORGS } from "@/config";

export function getTeams(repo: string, productArea: string | undefined, org: string): string[] {
    const orgObj = GH_ORGS.get(org);
    if (orgObj.repos.withoutRouting.includes(`${repo}`)) {
        return [PRODUCT_OWNERS_YML['repos'][repo]];
    }
    if (orgObj.repos.withRouting.includes(`${repo}`)) {
        if (productArea){
            return PRODUCT_OWNERS_YML['product_areas'][productArea];
        }
    }
    return [];
}
