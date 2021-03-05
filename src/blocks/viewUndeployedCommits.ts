export function viewUndeployedCommits(commitRange: string, id?: string) {
  return {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'View Undeployed Commits',
      emoji: true,
    },
    value: commitRange,
    action_id: `view-undeployed-commits-${id}`,
  };
}
