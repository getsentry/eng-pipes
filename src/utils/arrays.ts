export function filterNulls<T>(array: Array<T | null>): Array<T> {
  return array.filter((item): item is Exclude<T, null> => item !== null);
}
