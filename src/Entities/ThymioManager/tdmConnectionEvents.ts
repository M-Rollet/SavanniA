type ConnectionListener = (connected: boolean) => void;
const listeners = new Set<ConnectionListener>();

export const tdmConnectionEvents = {
  emit: (connected: boolean) => listeners.forEach(fn => fn(connected)),
  subscribe: (fn: ConnectionListener) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
