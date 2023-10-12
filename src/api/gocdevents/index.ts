import { EventEmitter } from 'events';

import { GoCDResponse } from '~/src/types';

type GoCDEvents = 'stage' | 'agent';

interface GoCDEventEmitter {
  on(event: '*' | GoCDEvents, listener: (payload: GoCDResponse) => void): this;
}

/**
 * Extend base EventEmitter so that we can use '*' to listen to all events
 */
class GoCDEventEmitter extends EventEmitter {
  emit(event: GoCDEvents, reqBody: GoCDResponse) {
    // During GoCD deployments, group name is initially missing
    if (event === 'stage' && !reqBody.data.pipeline.group) return false;
    super.emit('*', reqBody);
    return super.emit(event, reqBody);
  }
}

const gocdevents = new GoCDEventEmitter();
export { gocdevents };
