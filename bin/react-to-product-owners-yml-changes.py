#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from os.path import dirname, join, realpath

import yaml

def main():
    # Run from project root.
    os.chdir(realpath(join(dirname(sys.argv[0]), "..")))

    product_owners_yml = yaml.safe_load(open(sys.argv[1]))
    product_area_to_team_map = {}
    team_to_info_map = {}
    repo_to_team_map = {}

    for product_area, fields in product_owners_yml['by_area'].items():
        product_area_to_team_map[product_area] = fields['teams']

    for team, fields in product_owners_yml['by_team'].items():
        # TODO(team-ospo/issues#198):: remove ternary here and require a slack channel for teams
        team_to_info_map[team] = {}
        team_to_info_map[team]['slack_channel'] = fields['slack_channel'] if 'slack_channel' in fields else None
        team_to_info_map[team]['offices'] = fields['offices'] if 'offices' in fields else None

    for repo, team in product_owners_yml['by_repo'].items():
        repo_to_team_map[repo] = team

    fp = 'product-owners.yml'

    with open(fp, 'w') as file:
        data = {
            'product_areas': product_area_to_team_map,
            'teams': team_to_info_map,
            'repos': repo_to_team_map
        }
        yaml.dump(data, file)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
