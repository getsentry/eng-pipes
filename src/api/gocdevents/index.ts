import { EventEmitter } from 'events';

import { GoCDPayload } from '@types';

type GoCDEvents = 'stage' | 'agent';

interface GoCDEventEmitter {
  on(event: '*' | GoCDEvents, listener: (payload: GoCDPayload) => void): this;
}

/**
 * Extend base EventEmitter so that we can use '*' to listen to all events
 */
class GoCDEventEmitter extends EventEmitter {
  emit(event: GoCDEvents, reqBody: GoCDPayload) {
    super.emit('*', reqBody);
    return super.emit(event, reqBody);
  }
}

const gocdevents = new GoCDEventEmitter();
export { gocdevents };
