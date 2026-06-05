import { Client } from '@notionhq/client';

import { GITHUB_USER_DIRECTORY_NOTION } from '@/config';

const notionClient = new Client({ auth: GITHUB_USER_DIRECTORY_NOTION.token });

export type GhDirectoryRow = {
  email: string;
  githubUsername: string;
};

export async function fetchGithubUserDirectory(): Promise<GhDirectoryRow[]> {
  const rows: GhDirectoryRow[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await notionClient.databases.query({
      database_id: GITHUB_USER_DIRECTORY_NOTION.databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      const props = (page as any).properties;
      const email = joinRichText(props?.Email?.title);
      const githubUsername = joinRichText(
        props?.['GitHub Username']?.rich_text
      );
      if (email && githubUsername) {
        rows.push({ email, githubUsername });
      }
    }

    if (!response.has_more || !response.next_cursor) {
      break;
    }
    cursor = response.next_cursor;
  }

  return rows;
}

function joinRichText(spans: Array<{ plain_text?: string }> | undefined) {
  if (!spans) {
    return '';
  }
  return spans.map((span) => span.plain_text ?? '').join('');
}
