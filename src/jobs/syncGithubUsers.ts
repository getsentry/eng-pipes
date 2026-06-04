import { v1 } from '@datadog/datadog-api-client';
import * as Sentry from '@sentry/node';
import moment from 'moment-timezone';

import { DATADOG_API_INSTANCE } from '@/config';
import { normalizeGithubUser } from '@/utils/github/normalizeGithubUser';
import { isSentrySlackUser } from '@/utils/slack/isSentrySlackUser';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { fetchGithubUserDirectory } from '@utils/db/githubUserDirectory';

type SyncCounters = {
  total: number;
  upserted: number;
  slackMisses: number;
  errors: number;
};

/**
 * Pulls the {email -> github_username} mapping from the Notion directory,
 * resolves each email to a Slack user, and upserts into the `users` table.
 *
 * Mirrors getUser's write path:
 *   - normalizeGithubUser strips github.com prefixes
 *   - onConflict('email').merge() to update existing rows
 *   - isSentrySlackUser gate weeds out deactivated/restricted accounts
 *
 * When DRY_RUN is set, the upsert is skipped and the would-write payload is
 * logged instead — counters still reflect what would have been written.
 *
 * No removal logic in v1 — keeps stale rows in place, matching today's
 * behavior. Revisit once we see real data.
 */
export async function syncGithubUsers(): Promise<SyncCounters> {
  const dryRun = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
  const counters: SyncCounters = {
    total: 0,
    upserted: 0,
    slackMisses: 0,
    errors: 0,
  };

  let rows;
  try {
    rows = await fetchGithubUserDirectory();
  } catch (err) {
    Sentry.captureException(err);
    await emitDatadogEvent(counters, 'error');
    throw err;
  }
  counters.total = rows.length;

  for (const { email, githubUsername } of rows) {
    try {
      const login = normalizeGithubUser(githubUsername);
      if (!login) {
        continue;
      }

      // Typed as `any` to match getUser's pattern — @slack/web-api v6's
      // response type for lookupByEmail leaves .user too weakly typed for
      // direct use with our SlackUser shape.
      const slackResult: any = await bolt.client.users.lookupByEmail({ email });
      if (
        !slackResult.ok ||
        !slackResult.user ||
        !isSentrySlackUser(slackResult.user)
      ) {
        counters.slackMisses++;
        continue;
      }

      if (dryRun) {
        /* eslint-disable-next-line no-console */
        console.log(
          `[syncGithubUsers] dry-run: would upsert email=${email} slackUser=${slackResult.user.id} githubUser=${login}`
        );
      } else {
        await db('users')
          .insert({
            email,
            slackUser: slackResult.user.id,
            githubUser: login,
          })
          .onConflict('email')
          .merge();
      }
      counters.upserted++;
    } catch (err) {
      counters.errors++;
      Sentry.setContext('syncGithubUsers.row', { email, githubUsername });
      Sentry.captureException(err);
    }
  }

  await emitDatadogEvent(
    counters,
    counters.errors > 0 ? 'warning' : 'info',
    dryRun
  );
  return counters;
}

async function emitDatadogEvent(
  counters: SyncCounters,
  alertType: 'info' | 'warning' | 'error',
  dryRun = false
) {
  const params: v1.EventCreateRequest = {
    title: 'eng-pipes sync-github-users',
    text: `total=${counters.total} upserted=${counters.upserted} slackMisses=${counters.slackMisses} errors=${counters.errors}`,
    alertType,
    dateHappened: moment().unix(),
    tags: [
      'source_tool:eng-pipes',
      'source:eng-pipes',
      'source_category:infra-tools',
      'job:sync-github-users',
      ...(dryRun ? ['dry_run:true'] : []),
    ],
  };
  try {
    await DATADOG_API_INSTANCE.createEvent({ body: params });
  } catch (err) {
    Sentry.captureException(err);
  }
}
