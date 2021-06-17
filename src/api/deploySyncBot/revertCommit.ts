import * as https from 'https';

import { DEPLOY_SYNC_BOT_HOST } from '@/config';

type RevertCommitParams = {
  sha: string;
  repo: string;
};

export async function revertCommit({ sha, repo }: RevertCommitParams) {
  const data = JSON.stringify({
    commit: sha,
    repo,
    name: '',
  });

  const options = {
    hostname: DEPLOY_SYNC_BOT_HOST,
    port: 443,
    path: '/api/revert',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  return await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log(`statusCode: ${res.statusCode}`);

      res.on('data', (d) => {
        resolve(d);
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
