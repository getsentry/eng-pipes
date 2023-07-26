#!/usr/bin/env zsh

nodeId=$(
  gh api graphql -f query='
    query{
      organization(login: "'$1'"){
        projectV2(number: '$2') {
          id
        }
      }
    }' \
  | jq -r '.data.organization.projectV2.id'
)

fields=$(
  gh api graphql -f query='
    query{
      node(id: "'$nodeId'") {
        ... on ProjectV2 {
          fields(first: 20) {
            nodes {
              ... on ProjectV2FieldCommon {
                id
                name
              }
            }
          }
        }
      }
    }' \
)

function id () {
  echo "$fields" | jq -r '.data.node.fields.nodes[] | select(.name=="'"$1"'").id'
}

echo "    nodeId: '$nodeId'"
echo "    fieldIds:"
echo "      productArea: '"$(id 'Product Area')"'"
echo "      status: '"$(id 'Status')"'"
echo "      responseDue: '"$(id 'Response Due')"'"
