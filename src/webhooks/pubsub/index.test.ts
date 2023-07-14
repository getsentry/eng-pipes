import { Reply } from 'fastify';

import { buildServer } from '@/buildServer';
import { GETSENTRY_ORG } from '@/config';
import { Fastify } from '@/types';

import { pubSubHandler } from './';

describe('projectsHandler', function () {
  let fastify: Fastify;

  beforeEach(async function () {
    fastify = await buildServer(false);
  });

  afterEach(async function () {
    fastify.close();
    jest.clearAllMocks();
  });

  async function callWith(name: string) {
    const payload = Buffer(JSON.stringify({ name })).toString('base64');
    const request = { body: { message: { data: payload } } };
    const reply = { code: jest.fn(), send: jest.fn() };
    const cheeser = jest.fn();
    const breader = jest.fn();
    const funcMap = new Map([
      ['cheese', cheeser],
      ['bread', breader],
    ]);
    await pubSubHandler(request, reply, funcMap);
    return [reply.code.mock.calls[0][0], cheeser, breader];
  }

  describe('pubSubHandler', function () {
    it('basically works', async function () {
      const [code, cheeser, breader] = await callWith('cheese');
      expect(code).toBe(204);
      expect(cheeser).toHaveBeenCalled();
      expect(breader).not.toHaveBeenCalled();
    });
    it('handles a different task', async function () {
      const [code, cheeser, breader] = await callWith('bread');
      expect(code).toBe(204);
      expect(cheeser).not.toHaveBeenCalled();
      expect(breader).toHaveBeenCalled();
    });
    it('sends 400 for unknown tasks', async function () {
      const [code, cheeser, breader] = await callWith('wine');
      expect(code).toBe(400);
      expect(cheeser).not.toHaveBeenCalled();
      expect(breader).not.toHaveBeenCalled();
    });
    it('is called twice, once for each app', async function () {
      const [code, cheeser, breader] = await callWith('cheese');
      expect(cheeser.mock.calls.length).toBe(2);
      expect(cheeser.mock.calls[0][0].org).toBe('Enterprise');
      expect(cheeser.mock.calls[1][0].org).toBe(GETSENTRY_ORG);
    });
  });
});
