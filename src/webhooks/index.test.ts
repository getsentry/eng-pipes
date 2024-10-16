import fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import * as bootstrapDevEnv from './bootstrap-dev-env/bootstrap-dev-env';
import * as gocdWebhooks from './gocd/gocd';
import * as kafkaWebhooks from './kafka-control-plane/kafka-control-plane';
import * as sentryOptionsWebhooks from './sentry-options/sentry-options';
import * as webpackWebhooks from './webpack/webpack';
import { handleRoute, routeHandlers } from '.';

const mockBootstrapWebhook = jest.fn(
  async (_request: FastifyRequest, response: FastifyReply) => {
    response.code(200).send('OK');
  }
);
const mockGocd = jest.fn(
  async (_request: FastifyRequest, response: FastifyReply) => {
    response.code(200).send('OK');
  }
);
const mockKafkaCtlPlane = jest.fn(
  async (_request: FastifyRequest, response: FastifyReply) => {
    response.code(200).send('OK');
  }
);
const mockSentryOptions = jest.fn(
  async (_request: FastifyRequest, response: FastifyReply) => {
    response.code(200).send('OK');
  }
);
const mockWebpack = jest.fn(
  async (_request: FastifyRequest, response: FastifyReply) => {
    response.code(204).send();
  }
);
class MockReply {
  statusCode: number = 0;
  code(c) {
    this.statusCode = c;
    return this;
  }
  send() {}
}

describe('cron jobs testing', function () {
  let server: FastifyInstance;

  beforeEach(async function () {
    jest
      .spyOn(bootstrapDevEnv, 'bootstrapWebhook')
      .mockImplementation(mockBootstrapWebhook);

    jest.spyOn(gocdWebhooks, 'gocdWebhook').mockImplementation(mockGocd);

    jest
      .spyOn(kafkaWebhooks, 'kafkactlWebhook')
      .mockImplementation(mockKafkaCtlPlane);

    jest
      .spyOn(sentryOptionsWebhooks, 'sentryOptionsWebhook')
      .mockImplementation(mockSentryOptions);

    jest
      .spyOn(webpackWebhooks, 'webpackWebhook')
      .mockImplementation(mockWebpack);

    server = fastify();
    server.register(routeHandlers);
    mockBootstrapWebhook.mockClear();
    mockGocd.mockClear();
    mockKafkaCtlPlane.mockClear();
    mockSentryOptions.mockClear();
    mockWebpack.mockClear();
  });

  afterEach(() => {
    server.close();
    jest.clearAllMocks();
  });

  it('Expect 400 Bad Request error for bad handler', async () => {
    const mockError = jest.fn(
      async (_request: FastifyRequest, _response: FastifyReply) => {
        throw new Error('Bad Request');
      }
    );
    const reply = new MockReply() as FastifyReply;
    await handleRoute(mockError, {} as FastifyRequest, reply, '');
    expect(mockError).toHaveBeenCalled();
    expect(reply.statusCode).toBe(400);
  });

  it('POST /metrics/bootstrap-dev-env/webhook should call bootstrapWebhook', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/metrics/bootstrap-dev-env/webhook',
    });
    expect(reply.statusCode).toBe(200);
    expect(mockBootstrapWebhook).toHaveBeenCalled();
    expect(mockGocd).not.toHaveBeenCalled();
    expect(mockKafkaCtlPlane).not.toHaveBeenCalled();
    expect(mockSentryOptions).not.toHaveBeenCalled();
    expect(mockWebpack).not.toHaveBeenCalled();
  });

  it('POST /metrics/gocd/webhook should call gocdWebhook', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/metrics/gocd/webhook',
    });
    expect(reply.statusCode).toBe(200);
    expect(mockBootstrapWebhook).not.toHaveBeenCalled();
    expect(mockGocd).toHaveBeenCalled();
    expect(mockKafkaCtlPlane).not.toHaveBeenCalled();
    expect(mockSentryOptions).not.toHaveBeenCalled();
    expect(mockWebpack).not.toHaveBeenCalled();
  });

  it('POST /metrics/kafka-control-plane/webhook should call kafkactlWebhook', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/metrics/kafka-control-plane/webhook',
    });
    expect(reply.statusCode).toBe(200);
    expect(mockBootstrapWebhook).not.toHaveBeenCalled();
    expect(mockGocd).not.toHaveBeenCalled();
    expect(mockKafkaCtlPlane).toHaveBeenCalled();
    expect(mockSentryOptions).not.toHaveBeenCalled();
    expect(mockWebpack).not.toHaveBeenCalled();
  });

  it('POST /metrics/sentry-options/webhook should call sentryOptionsWebhook', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/metrics/sentry-options/webhook',
    });
    expect(reply.statusCode).toBe(200);
    expect(mockBootstrapWebhook).not.toHaveBeenCalled();
    expect(mockGocd).not.toHaveBeenCalled();
    expect(mockKafkaCtlPlane).not.toHaveBeenCalled();
    expect(mockSentryOptions).toHaveBeenCalled();
    expect(mockWebpack).not.toHaveBeenCalled();
  });

  it('POST /metrics/webpack/webhook should call webpackWebhook', async () => {
    const reply = await server.inject({
      method: 'POST',
      url: '/metrics/webpack/webhook',
    });
    expect(reply.statusCode).toBe(204);
    expect(mockBootstrapWebhook).not.toHaveBeenCalled();
    expect(mockGocd).not.toHaveBeenCalled();
    expect(mockKafkaCtlPlane).not.toHaveBeenCalled();
    expect(mockSentryOptions).not.toHaveBeenCalled();
    expect(mockWebpack).toHaveBeenCalled();
  });
});
