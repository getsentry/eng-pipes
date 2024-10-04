/**
 * Extracts the run id from a URL
 *
 * Example URL: https://github.com/getsentry/getsentry/runs/4327813370?check_suite_focus=true
 *
 * @param url URL to a GitHub Actions job
 */
export function extractRunId(url: string) {
  // For now this is always from `getsentry/getsentry`
  const regexp = /https:\/\/github.com\/getsentry\/getsentry\/runs\/(\d+)\??/;

  const matches = url.match(regexp);

  return matches?.[1];
}
