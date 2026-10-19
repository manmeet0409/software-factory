import { EventEmitter } from 'events';

export interface FactoryEvent {
  type:
    | 'ticket:created'
    | 'ticket:updated'
    | 'comment:added'
    | 'activity:logged'
    | 'wall:updated'
    | 'session:updated'
    | 'agent:chunk'
    | 'agent:tool'
    | 'agent:completed'
    | 'workspace:changed'
    | 'model:updated';
  data: Record<string, unknown>;
  timestamp: number;
}

class FactoryEventBus extends EventEmitter {
  emitEvent(type: FactoryEvent['type'], data: Record<string, unknown>) {
    const event: FactoryEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.emit('factory:event', event);
  }
}

// Global singleton to persist across Next.js API reloads
const globalForEvents = global as unknown as { factoryEventBus?: FactoryEventBus };
export const eventBus = globalForEvents.factoryEventBus ?? new FactoryEventBus();
if (process.env.NODE_ENV !== 'production') globalForEvents.factoryEventBus = eventBus;
