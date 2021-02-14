import { IncomingMessage, Server, ServerResponse } from 'http';

import { FastifyInstance } from 'fastify';

import { pleaseDeployNotifier } from '../github/brain/pleaseDeployNotifier';

import { appHome } from './brain/appHome';
import { ghaCancel } from './brain/gha-cancel';
import { notificationPreferences } from './brain/notificationPreferences';
import { typescript } from './brain/typescript';

export function createSlack(
  server: FastifyInstance<Server, IncomingMessage, ServerResponse>,
  opts: any,
  done: () => void
) {
  typescript();
  ghaCancel();
  pleaseDeployNotifier();
  notificationPreferences();
  appHome();

  done();
}
