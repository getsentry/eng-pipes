import * as https from 'https';

import { GIT_BOT_HOST, GIT_BOT_SECRET } from '@/config';
import { createSignature } from '@utils/createSignature';

type RevertCommitParams = {
  sha: string;
  repo: string;
  name: string;
};

export async function revertCommit(params: RevertCommitParams) {
  const data = JSON.stringify(params);

  const options = {
    hostname: GIT_BOT_HOST,
    port: 443,
    path: '/api/revert',
    method: 'POST',
    headers: {
      'X-Signature': `sha1=${createSignature(data, GIT_BOT_SECRET)}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  return await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.on('data', (d) => {
        if (res?.statusCode && res.statusCode < 400) {
          resolve(d.toString());
        } else {
          reject(d.toString());
        }
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
