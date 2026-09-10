type Listener<T> = (data: T) => void;

export class TypedEventEmitter<Events extends Record<string, any>> {
  private listeners: { [K in keyof Events]?: Array<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(listener);

    return () => {
      this.off(event, listener);
    };
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const list = this.listeners[event];
    if (!list) return;
    this.listeners[event] = list.filter(l => l !== listener);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const list = this.listeners[event];
    if (!list) return;
    for (const listener of list) {
      listener(data);
    }
  }

  clear(): void {
    this.listeners = {};
  }
}
