export function revertCommit({ sha, repo }: { sha: string; repo: string }) {
  return {
    type: 'button',
    style: 'danger',
    text: {
      type: 'plain_text',
      text: 'Revert Commit',
      emoji: true,
    },
    value: JSON.stringify({ sha, repo }),
    action_id: `revert-commit`,
  };
}
