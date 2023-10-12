import { extractRunId } from './extractRunId';

import { GETSENTRY_ORG, GETSENTRY_REPO_SLUG } from '~/src/config';
import { Annotation } from '~/src/types';

// Filter any annotations that match these patterns
const FILTER_SINGLE: RegExp[] = [];

const FILTER_ALL_PRESENT: Array<RegExp[]> = [
  // Only ignore this pattern if they are together (e.g. we do not want to
  // ignore if operation was canceled due to something else)
  [/^The operation was canceled/i, /^The job was canceled because .* failed/i],
];

const PROCESS_CODE_PATTERN = /Process completed with exit code/;

/**
 * Filter out annotations that match ALL patterns in each row
 * that are defined in `FILTER_ALL_PRESENT`
 */
function filterAllPresent(annotations: Annotation[]) {
  const annotationMessages = annotations.map(({ message }) => message || '');

  // Are there any sets of patterns that all match?
  const allMatches = FILTER_ALL_PRESENT.filter((patterns) =>
    patterns.every((pattern) =>
      annotationMessages.find((message) => pattern.test(message))
    )
  ).flatMap((i) => i);

  // Now we can simply filter any annotations that match any pattern in `allMatches`
  return annotations.filter(
    (annotation) =>
      !allMatches.find((pattern) => pattern.test(annotation.message || ''))
  );
}

/**
 * Filters out annotations that match any patterns defined in `FILTER_SINGLE`
 */
function filterSingle(annotation: Annotation) {
  return !FILTER_SINGLE.find((pattern) =>
    pattern.test(annotation.message || '')
  );
}

/**
 * Filter annotations from patterns that we have defined as well as `Process
 * completed with exit code <...>` message when there are other error-level
 * annotations available as they are not as helpful because they do not provide
 * much context.
 */
function filterAnnotations(annotations: Annotation[]) {
  // Filter out annotations that have ALL of these patterns
  const filteredAnnotations =
    filterAllPresent(annotations).filter(filterSingle);

  // Do not consider warnings when trying to filter out "Process completed with
  // exit code <...>" message
  const failureAnnotations = filteredAnnotations.filter(
    (annotation) => annotation.annotation_level === 'failure'
  );

  // Now we can filter out any "Process completed with exit code <...>."
  // messages *ONLY* if we have other error-level annotations.  We should
  // ideally *always* have an annotation as they generally give better context
  // of what went wrong, but that currently isn't always the case.
  //
  // We still want to return non-failure annotations.
  return failureAnnotations.length > 1
    ? filteredAnnotations.filter(
        (annotation) => !PROCESS_CODE_PATTERN.test(annotation.message || '')
      )
    : filteredAnnotations;
}

/**
 * Given a list of [job link text, conclusion], return a map of <job link text, annotations>
 */
export async function getAnnotations(
  jobs: string[][]
): Promise<Record<string, Annotation[]>> {
  const annotations = await Promise.all(
    jobs
      // We need to extract the run id from a string that comes from a GHA
      // Action (requiredChecks in `getsentry`)
      .map(([jobLink]) => [jobLink, extractRunId(jobLink)])
      .filter(([, runId]) => runId)
      .map(async ([jobLink, checkRunId]) => {
        const { data: annotations } =
          await GETSENTRY_ORG.api.checks.listAnnotations({
            owner: GETSENTRY_ORG.slug,
            repo: GETSENTRY_REPO_SLUG,
            check_run_id: parseInt(checkRunId ?? '0', 10),
          });

        return [jobLink, filterAnnotations(annotations)];
      })
  );

  return Object.fromEntries(annotations);
}
