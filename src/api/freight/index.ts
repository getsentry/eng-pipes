import { EventEmitter } from 'events';

import { FreightPayload, FreightStatus } from '@types';

interface Payload extends FreightPayload {
  status: FreightStatus;
}

interface MyEventEmitter {
  on(event: FreightStatus | '*', listener: (payload: Payload) => void): this;
}

/**
 * Extend base EventEmitter so that we can use '*' to listen to all events
 */
class MyEventEmitter extends EventEmitter {
  emit(type: FreightStatus, payload: Payload) {
    super.emit('*', payload);
    return super.emit(type, payload) || super.emit('', payload);
  }
}
const freight = new MyEventEmitter();

export { freight };
