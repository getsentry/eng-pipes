import * as Sentry from '@sentry/node';

import testAdminPayload from '@test/payloads/kafka-control-plane/testAdminPayload.json';
import testBadPayload from '@test/payloads/kafka-control-plane/testBadPayload.json';
import testMegaPayload from '@test/payloads/kafka-control-plane/testMegaPayload.json';
import testPayload from '@test/payloads/kafka-control-plane/testPayload.json';
import { createKCPRequest } from '@test/utils/createKafkaControlPlaneRequest';

import { buildServer } from '@/buildServer';
import { bolt } from '@api/slack';

import { messageSlack } from './status-page';

describe('kafka-control-plane webhook', function () {
  let fastify;
  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(function () {
    fastify.close();
    jest.clearAllMocks();
  });

  it('correctly inserts kafka-control-plane webhook when stage starts', async function () {
    const response = await createKCPRequest(fastify, testPayload);

    expect(response.statusCode).toBe(200);
  });

  it('returns 401 for invalid signature', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/kafka-control-plane/webhook',
      headers: {
        'x-kafka-control-plane-signature': 'invalid',
      },
      payload: testPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for no signature', async function () {
    const response = await fastify.inject({
      method: 'POST',
      url: '/metrics/kafka-control-plane/webhook',
      payload: testPayload,
    });
    expect(response.statusCode).toBe(401);
  });

  describe('messageSlack tests', function () {
    afterEach(function () {
      jest.clearAllMocks();
    });

    it('handles bad fields and reports to Sentry', async function () {
      const sentryCaptureExceptionSpy = jest.spyOn(Sentry, 'captureException');
      const sentrySetContextSpy = jest.spyOn(Sentry, 'setContext');
      await messageSlack(testBadPayload);
      await messageSlack(testMegaPayload);
      expect(sentryCaptureExceptionSpy).toHaveBeenCalledTimes(2);
      expect(sentrySetContextSpy).toHaveBeenCalledTimes(2);
      expect(sentrySetContextSpy.mock.calls[0][0]).toEqual(`message_data`);
      expect(sentrySetContextSpy.mock.calls[0][1]).toEqual({
        message: {
          bad_key_name: 'not good',
          source: 'kafka-control-plane',
          title: 'this is a title',
        },
      });
      expect(sentrySetContextSpy.mock.calls[1][0]).toEqual(`message_data`);
      expect(sentrySetContextSpy.mock.calls[1][1]).toEqual({
        message: {
          source: 'kafka-control-plane',
          title: 'really, really big payload',
          body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.\nSed fringilla venenatis ipsum eu vestibulum.\nNam ultricies, elit sed commodo eleifend, ipsum est tempus lorem, porttitor molestie urna sem in eros.\nSuspendisse non interdum sapien, vel commodo dui.\nNunc eu scelerisque augue.\nAliquam eget rhoncus leo.\nDonec nulla elit, aliquet ut porttitor at, sodales quis ex.\nMaecenas sit amet pretium neque.\nIn eu nisi vel purus mattis vehicula in sed mauris.\nPellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.\nProin varius eget nisl sed vulputate.\nFusce quis nibh eu enim blandit bibendum.\nCras volutpat est erat, sit amet molestie ante commodo hendrerit.\nPellentesque in luctus augue.Lorem ipsum dolor sit amet, consectetur adipiscing elit.\nIn ac bibendum odio, condimentum finibus nisi.\nIn at enim vel elit aliquet dictum.\nNullam efficitur gravida gravida.\nNullam scelerisque euismod mi, non dictum elit posuere sed.\nSed dictum quam in ornare lacinia.\nDonec vulputate dictum tortor quis volutpat.\nCurabitur at nulla hendrerit, placerat nibh sed, gravida metus.\nMaecenas nec eros sollicitudin, consectetur nibh sit amet, fringilla nibh.\nUt efficitur convallis luctus.\nIn ultricies lectus non urna faucibus, a venenatis ipsum mollis.\nVivamus tincidunt interdum lorem vitae fermentum.\nVivamus ante nunc, facilisis sed velit egestas, maximus euismod enim.\nSed pretium et ligula ac suscipit.\nSed et metus ut orci faucibus lacinia.\nInteger vestibulum commodo blandit.\nIn dapibus libero nec mauris sagittis, vel accumsan erat feugiat.\nCurabitur tempus, arcu non accumsan faucibus, sapien nisl pharetra justo, id fringilla mauris sem eu ante.\nProin ac feugiat dolor.\nNulla auctor vestibulum tortor at placerat.\nCras tempus non tortor ut dictum.\nSed eleifend velit nisi, sit amet lacinia velit convallis non.\nCurabitur imperdiet tortor sit amet massa condimentum, nec cursus lectus placerat.\nUt egestas suscipit est, at ultricies tellus viverra ut.\nSed elementum dignissim nulla, a feugiat massa mollis quis.\nPellentesque a lobortis dolor.\nCras eleifend condimentum orci, a venenatis arcu feugiat at.\nSuspendisse condimentum neque metus, non faucibus libero ultricies nec.\nInteger quis orci at enim aliquet dapibus id quis nisl.\nMaecenas et convallis massa.\nSed ornare sagittis erat, et hendrerit neque auctor quis.\nSed dignissim erat nisl, sed pharetra mauris sollicitudin sed.\nNullam eu purus quis augue scelerisque aliquam id sed enim.\nMaecenas in posuere ex.\nVivamus quis sem faucibus, suscipit eros nec, bibendum purus.\nUt in urna orci.\nAenean id bibendum urna.\nDuis gravida ac massa vel egestas.\nFusce in erat hendrerit nunc tempus dictum.\nCras sapien diam, eleifend vitae commodo in, bibendum ut eros.\nNam sit amet massa tincidunt neque rutrum sodales.\nNunc vitae felis ut diam lobortis pellentesque.\nNunc nulla ante, sodales non tempor pretium, vulputate vel nisi.\nNulla facilisis dolor sit amet aliquam imperdiet.\nPellentesque lacinia augue eget nulla finibus tincidunt.\nNam urna tellus, aliquam sit amet velit vestibulum, dictum eleifend dolor.\nDonec eu commodo est, non tincidunt orci.\nCras vel nisl libero.\nPraesent cursus neque massa.\nNunc convallis vitae sem nec tincidunt.\nEtiam eget dui in ligula dictum sodales nec quis ante.\nCras sagittis, dui at tempus porttitor, lectus ipsum malesuada augue, vitae suscipit felis lacus facilisis nisl.\nDonec tristique tellus at aliquet accumsan.\nInteger elementum venenatis mollis.\nSuspendisse rutrum eros eget justo scelerisque facilisis.\nDonec vehicula neque at lectus interdum egestas.\nPellentesque dolor dui, feugiat ac placerat sit amet, lacinia sed massa.\nMaecenas aliquam, massa sodales ultrices pellentesque, est tortor pharetra metus, at congue libero ligula ut purus.\nVestibulum mattis scelerisque tellus, vitae volutpat velit ultrices nec.\nUt mollis hendrerit magna vitae mollis.\nNulla pharetra magna eros, quis facilisis arcu accumsan sodales.\nIn pharetra quam maximus turpis volutpat blandit.\nIn at dui nec velit sagittis tincidunt.\nIn felis orci, vulputate non luctus ac, molestie vitae urna.\nIn iaculis velit id convallis condimentum.',
        },
      });
    });

    it('writes to slack', async function () {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(1);
      const message = postMessageSpy.mock.calls[0][0];
      expect(message).toEqual({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'this is a title',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'this is a text body',
            },
          },
        ],
        text: '',
        channel: 'C07DQR95XSS',
        unfurl_links: false,
      });
    });

    it('only writes kafka-control-plane changes', async function () {
      const postMessageSpy = jest.spyOn(bolt.client.chat, 'postMessage');
      await messageSlack(testAdminPayload);
      expect(postMessageSpy).toHaveBeenCalledTimes(0);
    });
  });
});
