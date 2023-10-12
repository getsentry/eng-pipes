import { getAnnotations } from './getAnnotations';

import { GETSENTRY_ORG } from '~/src/config';

describe('getAnnotations', function () {
  const org = GETSENTRY_ORG;

  beforeEach(function () {
    org.api.checks.listAnnotations.mockClear();
  });

  it('returns annotations without "Process completed with exit code..."', async function () {
    expect(
      await getAnnotations([
        [
          'https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true',
          'failed',
        ],
      ])
    ).toMatchInlineSnapshot(`
      Object {
        "https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true": Array [
          Object {
            "annotation_level": "failure",
            "blob_href": "https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/tests/snuba/rules/conditions/test_event_frequency.py",
            "end_column": null,
            "end_line": 570,
            "message": "EventFrequencyPercentConditionTestCase.test_one_hour_with_events

      AssertionError",
            "path": "tests/snuba/rules/conditions/test_event_frequency.py",
            "raw_details": null,
            "start_column": null,
            "start_line": 570,
            "title": "tests/snuba/rules/conditions/test_event_frequency.py#L570",
          },
        ],
      }
    `);
  });

  it('returns annotation with only "Process completed with exit code..."', async function () {
    org.api.checks.listAnnotations.mockImplementation(() => ({
      data: [
        {
          path: '.github',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github',
          start_line: 1,
          start_column: null,
          end_line: 1,
          end_column: null,
          annotation_level: 'failure',
          title: '.github#L1',
          message: 'Process completed with exit code 2.',
          raw_details: null,
        },
      ],
    }));
    expect(
      await getAnnotations([
        [
          'https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true',
          'failed',
        ],
      ])
    ).toMatchInlineSnapshot(`
      Object {
        "https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true": Array [
          Object {
            "annotation_level": "failure",
            "blob_href": "https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github",
            "end_column": null,
            "end_line": 1,
            "message": "Process completed with exit code 2.",
            "path": ".github",
            "raw_details": null,
            "start_column": null,
            "start_line": 1,
            "title": ".github#L1",
          },
        ],
      }
    `);
  });

  it('returns annotation with "Process completed with exit code...", when there are only warning annotations', async function () {
    org.api.checks.listAnnotations.mockImplementation(() => ({
      data: [
        {
          path: '.github',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github',
          start_line: 1,
          start_column: null,
          end_line: 1,
          end_column: null,
          annotation_level: 'failure',
          title: '.github#L1',
          message: 'Process completed with exit code 2.',
          raw_details: null,
        },
        {
          path: '.github',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github',
          start_line: 1,
          start_column: null,
          end_line: 1,
          end_column: null,
          annotation_level: 'warning',
          title: '.github#L1',
          message: '"service_account_key" has been deprecated',
          raw_details: null,
        },
      ],
    }));

    expect(
      await getAnnotations([
        [
          'https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true',
          'failed',
        ],
      ])
    ).toMatchInlineSnapshot(`
      Object {
        "https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true": Array [
          Object {
            "annotation_level": "failure",
            "blob_href": "https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github",
            "end_column": null,
            "end_line": 1,
            "message": "Process completed with exit code 2.",
            "path": ".github",
            "raw_details": null,
            "start_column": null,
            "start_line": 1,
            "title": ".github#L1",
          },
          Object {
            "annotation_level": "warning",
            "blob_href": "https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github",
            "end_column": null,
            "end_line": 1,
            "message": "\\"service_account_key\\" has been deprecated",
            "path": ".github",
            "raw_details": null,
            "start_column": null,
            "start_line": 1,
            "title": ".github#L1",
          },
        ],
      }
    `);
  });

  it('does not ignore annotations from a manually canceled job', async function () {
    org.api.checks.listAnnotations.mockImplementation(() => ({
      data: [
        {
          path: '.github',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github',
          start_line: 1,
          start_column: null,
          end_line: 1,
          end_column: null,
          annotation_level: 'failure',
          title: '.github#L1',
          message: 'The operation was canceled.',
          raw_details: null,
        },
      ],
    }));

    expect(
      await getAnnotations([
        [
          'https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true',
          'failed',
        ],
      ])
    ).toMatchInlineSnapshot(`
      Object {
        "https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true": Array [
          Object {
            "annotation_level": "failure",
            "blob_href": "https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github",
            "end_column": null,
            "end_line": 1,
            "message": "The operation was canceled.",
            "path": ".github",
            "raw_details": null,
            "start_column": null,
            "start_line": 1,
            "title": ".github#L1",
          },
        ],
      }
    `);
  });

  it('ignores annotations from canceled jobs due to another failing job', async function () {
    org.api.checks.listAnnotations.mockImplementation(() => ({
      data: [
        {
          path: '.github',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github',
          start_line: 1,
          start_column: null,
          end_line: 1,
          end_column: null,
          annotation_level: 'failure',
          title: '.github#L1',
          message: 'The job was canceled because "_3_8_12_0" failed.',
          raw_details: null,
        },
        {
          path: '.github',
          blob_href:
            'https://github.com/getsentry/sentry/blob/83ef9b927cbb822febbdf75e5e05dd40afb187cf/.github',
          start_line: 1,
          start_column: null,
          end_line: 1,
          end_column: null,
          annotation_level: 'failure',
          title: '.github#L1',
          message: 'The operation was canceled.',
          raw_details: null,
        },
      ],
    }));

    expect(
      await getAnnotations([
        [
          'https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true',
          'failed',
        ],
      ])
    ).toEqual({
      'https://github.com/getsentry/getsentry/runs/4328085683?check_suite_focus=true':
        [],
    });
  });
});
