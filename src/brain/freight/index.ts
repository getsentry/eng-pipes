// Description:
//   Interact with the Freight deploy service.
//
// Configuration:
//   FREIGHT_URL
//   FREIGHT_API_KEY
//
// Commands:
//   deploy <app>:<revision> to <environment>
//   cancel <app>/<env>#<number>
//   rollback <app>/<env>
// return req[method.toLowerCase()](body)(function (err, resp, body) {
// if (err) {
// msg.reply('Freight says: ' + err);
// console.error('HTTP %d: %s', resp.statusCode, err);
// } else if (200 <= resp.statusCode && resp.statusCode < 400) {
// return;
// } else {
// const data = JSON.parse(body);
// msg.reply(
// 'Freight responded with HTTP ' + resp.statusCode + ': ' + data.error
// );
// console.error('HTTP %d: %s', resp.statusCode, body);
// }
// });

import * as Sentry from '@sentry/node';

import { cancelDeploy, deployRevision, rollback } from '@api/freight';
import { bolt } from '@api/slack';

async function handler({ event, say, client }) {
  const deployRegex = /deploy ([^\s\:\/]+)(\:([^\s]+))?( to ([^\s]+))?/i; // eslint-disable-line
  const rollbackRegex = /rollback ([^\/]+)(\/([^\s]+))?/i; // eslint-disable-line
  const cancelRegex = /cancel ([^\/]+)\/([^#]+)#(\d+)/i; // eslint-disable-line

  const deployMatches = event.text.match(deployRegex);
  if (deployMatches) {
    try {
      await deployRevision({
        app: deployMatches[1],
        ref: deployMatches[3],
        env: deployMatches[5],
        user: event.user,
      });
    } catch (err) {
      Sentry.captureException(err);
      say('There was an error deploying');
    }

    return;
  }

  const rollbackMatches = event.text.match(rollbackRegex);
  if (rollbackMatches) {
    try {
      await rollback({
        app: rollbackMatches[1],
        env: rollbackMatches[3],
        user: event.user,
      });
    } catch (err) {
      Sentry.captureException(err);
      say('There was an error rolling back');
    }
    return;
  }

  const cancelMatches = event.text.match(cancelRegex);
  if (cancelMatches) {
    try {
      await cancelDeploy({
        app: cancelMatches[1],
        env: cancelMatches[2],
        freightId: cancelMatches[3],
        user: event.user,
      });
    } catch (err) {
      Sentry.captureException(err);
      say('There was an error cancelling deploy');
    }
    return;
  }
}

export function freight() {
  bolt.event('app_mention', handler);
}
