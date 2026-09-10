function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

export function createCrossContextNotifier({
  contextId,
  channelName = 'atlas-storage-v4',
  BroadcastChannelImpl = globalThis.BroadcastChannel,
} = {}) {
  const sourceContextId = requiredText(contextId, 'contextId');
  if (typeof BroadcastChannelImpl !== 'function') {
    return {
      available: false,
      publish() {},
      subscribe() { return () => {}; },
      close() {},
    };
  }

  const channel = new BroadcastChannelImpl(channelName);
  const listeners = new Set();
  const onMessage = (event) => {
    const message = event?.data;
    if (!message || message.sourceContextId === sourceContextId) return;
    listeners.forEach((listener) => listener(message));
  };
  channel.addEventListener('message', onMessage);

  return {
    available: true,
    publish(type, payload = null) {
      channel.postMessage({
        type: requiredText(type, 'type'),
        payload,
        sourceContextId,
      });
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener debe ser función.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      channel.removeEventListener('message', onMessage);
      channel.close();
    },
  };
}
