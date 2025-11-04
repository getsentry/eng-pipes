import 'module-alias/register';

import moment from 'moment-timezone';

import { GH_ORGS } from '@/config';
import { triggerStaleBot } from '@/jobs/stalebot';

async function main() {
  const now = moment().utc();

  console.log(`Running stalebot at ${now.format()}`);
  console.log('---');

  for (const org of GH_ORGS.orgs.values()) {
    console.log(`Processing org: ${org.slug}`);
    try {
      await triggerStaleBot(org, now);
      console.log(`✓ Successfully processed ${org.slug}`);
    } catch (error) {
      console.error(`✗ Error processing ${org.slug}:`, error);
    }
    console.log('---');
  }

  console.log('Done!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
