/**
 * Helper for knex query builder
 *
 * Creates a raw query string for a column that holds a ISO8601 string in order to transform it to a pg timestamp
 */
export function getTimestamp(column: string) {
  return `to_timestamp(${column}, 'YYYY-MM-DD"T"HH24:MI:SS:MS"Z"')`;
}
