import { EmitterWebhookEvent } from '@octokit/webhooks';

import { TEAM_LABEL_PREFIX, UNTRIAGED_LABEL } from '@/config';
import { githubEvents } from '@api/github';
import { bolt } from '@api/slack';
import { db } from '@utils/db';
import { wrapHandler } from '@utils/wrapHandler';

export const getLabelsTable = () => db('label_to_channel');

export const githubLabelHandler = async ({
  payload: { issue, label, repository },
}: EmitterWebhookEvent<'issues.labeled'>): Promise<void> => {
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
    await getLabelsTable()
      .where({
        label_name: teamLabel,
      })
      .select('channel_id')
  ).map((row) => row.channel_id);

  await Promise.all(
    channelsToNotify.map((channel) =>
      bolt.client.chat.postMessage({
        text: `⏲ Issue pending triage: <${issue.html_url}|#${issue.number} ${issue.title}>`,
        channel,
      })
    )
  );
};

// /notify-for-triage`: List all team label subscriptions
// /notify-for-triage <name>`: Subscribe to all untriaged issues for `Team: <name>` label
// /notify-for-triage -<name>`: Unsubscribe from untriaged issues for `Team: <name>` label
export const slackHandler = async ({ command, ack, say, respond, client }) => {
  const pending: Promise<unknown>[] = [];
  // Acknowledge command request
  pending.push(ack());
  const { channel_id, channel_name, text } = command;
  const args = text.match(
    /^\s*(?<op>[+-]?)(?<label>.+)\s(?<office>yyz|vie|sea|sfo?)/
  )?.groups;
  if (!args) {
    const labels = (await getLabelsTable().where({ channel_id })).map(
      (row) => `${row.label_name} (${row.office})`
    );
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
    const newOffice = args.office;
    const currentOffice = (
      await getLabelsTable()
        .where({
          label_name,
          channel_id,
        })
        .select('office')
    )[0]?.office;
    let channelInfo;
    let result;

    switch (op) {
      case '+':
        try {
          channelInfo = await client.conversations.info({
            channel: channel_id,
          });
        } catch (err) {
          // @ts-expect-error
          if (err instanceof Error && err.data.error === 'channel_not_found') {
            pending.push(
              respond({
                response_type: 'ephemeral',
                text: `You need to invite me to the channel as it is private.`,
              })
            );
            break;
          } else {
            throw err;
          }
        }

        if (!channelInfo.channel.is_member) {
          await client.conversations.join({ channel: channel_id });
        }

        result = await getLabelsTable()
          .insert(
            {
              label_name,
              channel_id,
              office: newOffice,
            },
            'label_name'
          )
          .onConflict(['label_name', 'channel_id'])
          .ignore();

        if (result.length > 0) {
          pending.push(
            say(
              `Set untriaged issue notifications for '${result[0]}' on the current channel (${channelInfo.channel.name}). Notifications will come in during ${newOffice} hours.`
            )
          );
        } else if (newOffice != currentOffice) {
          result = await getLabelsTable()
            .where({
              label_name,
              channel_id,
            })
            .update({
              office: newOffice,
            });
          pending.push(
            say(
              `Set office location to ${newOffice} on the current channel (${channelInfo.channel.name}) for ${label_name}`
            )
          );
        } else {
          pending.push(
            respond({
              response_type: 'ephemeral',
              text: `This channel (${channel_name}) is already subscribed to '${label_name} for the ${newOffice} office hours'.`,
            })
          );
        }
        break;
      case '-':
        result = await getLabelsTable()
          .where({
            channel_id,
            label_name,
            office: newOffice,
          })
          .del('label_name');

        // Unlike in the subscribe action, we do not leave the channel here because the
        // bot might have been invited to the channel for other purposes too. So making
        // sure we are in the channel when they subscribe to notifications makes sense
        // but leaving when they unsubscribe is not sure game.
        pending.push(
          say(
            result.length > 0
              ? `This channel (${channel_name}) will no longer get notifications for ${result[0]} for the ${newOffice} office hours.`
              : `This channel (${channel_name}) is not subscribed to ${label_name} for the ${newOffice} office hours.`
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
