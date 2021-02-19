import { EventEmitter } from 'events';

/**
 * Extend base EventEmitter so that we can use '*' to listen to all events
 */
class MyEventEmitter extends EventEmitter {
  emit(type: string, ...args: any[]) {
    super.emit('*', ...args);
    return super.emit(type, ...args) || super.emit('', ...args);
  }
}
const freight = new MyEventEmitter();

export { freight };
