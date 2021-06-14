import { EmitterWebhookEvent } from '@octokit/webhooks';

import { githubEvents } from '@api/github';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { wrapHandler } from '@utils/wrapHandler';

const TEAM_LABEL_PREFIX = 'Team: ';
const UNTRIAGED_LABEL = 'Status: Untriaged';
const LABELS_TABLE = () => db('label_to_channel');

export const githubLabelHandler = async ({
  name: eventType,
  payload,
}: EmitterWebhookEvent<'issues.labeled'>): Promise<void> => {
  const { issue, label } = payload;

  if (!label) {
    return undefined;
  }

  let teamLabel: undefined | string;
  if (
    label.name.startsWith(TEAM_LABEL_PREFIX) &&
    issue.labels?.some((label) => label.name === UNTRIAGED_LABEL)
  ) {
    teamLabel = label.name;
  } else if (label.name === UNTRIAGED_LABEL) {
    teamLabel = issue.labels?.find((label) =>
      label.name.startsWith(TEAM_LABEL_PREFIX)
    )?.name;
  }

  if (!teamLabel) {
    return undefined;
  }

  // We didn't want to artificially limit this to 1-to-N or N-to-1, as N-to-N
  // mapping for this makes sense. Even more, a "channel" can actually be a
  // group convo or a private chat with the bot.
  const channelsToNotify = (
    await LABELS_TABLE()
      .where({
        label_name: teamLabel,
      })
      .select('channel_id')
  ).map((row) => row.channel_id);

  await Promise.all(
    channelsToNotify.map((channel) =>
      bolt.client.chat.postMessage({
        text: `⏲ Issue pending triage: <https://github.com/${payload.repository.full_name}/issues/${issue.number}|#${issue.number} ${issue.title}>`,
        channel,
      })
    )
  );
};

// /notify-for-triage`: List all team label subscriptions
// /notify-for-triage <name>`: Subscribe to all untriaged issues for `Team: <name>` label
// /notify-for-triage -<name>`: Unsubscribe from untriaged issues for `Team: <name>` label
export const slackHandler = async ({ command, ack, say, client }) => {
  const pending: Promise<unknown>[] = [];
  // Acknowledge command request
  pending.push(ack());
  const { channel_id, channel_name, text } = command;
  const args = text.match(/^\s*(?<op>[+-]?)(?<label>.+)/)?.groups;

  if (!args) {
    const labels = (
      await LABELS_TABLE().where({ channel_id }).select('label_name')
    ).map((row) => row.label_name);
    const response =
      labels.length > 0
        ? `This channel is set to receive notifications for: ${labels.join(
            ', '
          )}`
        : `This channel is not subscribed to any team notifications.`;
    pending.push(say(response));
  } else {
    const op = args.op || '+';
    const label_name = `Team: ${args.label}`;
    let result;

    switch (op) {
      case '+':
        result = await LABELS_TABLE()
          .insert(
            {
              label_name,
              channel_id,
            },
            'label_name'
          )
          .onConflict(['label_name', 'channel_id'])
          .ignore();

        if (result.length > 0) {
          pending.push(
            client.conversations.join({ channel: channel_id }),
            say(
              `Set untriaged issue notifications for '${result[0]}' on the current channel (${channel_name}).`
            )
          );
        } else {
          pending.push(
            say(
              `This channel (${channel_name}) is already subscribed to '${label_name}'.`
            )
          );
        }
        break;
      case '-':
        result = await LABELS_TABLE()
          .where({
            channel_id,
            label_name,
          })
          .del('label_name');

        // Unlike in the subscribe action, we do not leave the channel here because the
        // bot might have been invited to the channel for other purposes too. So making
        // sure we are in the channel when they subscribe to notifications makes sense
        // but leaving when they unsubscribe is not sure game.
        pending.push(
          say(
            result.length > 0
              ? `This channel (${channel_name}) will no longer get notifications for ${result[0]}`
              : `This channel (${channel_name}) is not subscribed to ${label_name}.`
          )
        );
        break;
    }
  }

  await Promise.all(pending);
};

export async function issueTriageNotifier() {
  githubEvents.on(
    'issues.labeled',
    wrapHandler('issueTriageNotifier', githubLabelHandler)
  );

  bolt.command(
    '/notify-for-triage',
    wrapHandler('issueTriageNotifier', slackHandler)
  );
}
