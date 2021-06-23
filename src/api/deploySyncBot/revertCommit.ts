import * as https from 'https';

import { DEPLOY_SYNC_BOT_HOST, DEPLOY_SYNC_BOT_SECRET } from '@/config';
import { createSignature } from '@utils/createSignature';

type RevertCommitParams = {
  sha: string;
  repo: string;
  name: string;
};

export async function revertCommit(params: RevertCommitParams) {
  const data = JSON.stringify(params);

  const options = {
    hostname: DEPLOY_SYNC_BOT_HOST,
    port: 443,
    path: '/api/revert',
    method: 'POST',
    headers: {
      'X-Signature': `sha1=${createSignature(data, DEPLOY_SYNC_BOT_SECRET)}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  return await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.on('data', (d) => {
        resolve(d.toString());
      });
      // TODO(billy): Will need to test if this happens
      res.on('error', (error) => {
        console.error(error);
        reject(error);
      });
    });

    req.on('error', (error) => {
      console.error(error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}
