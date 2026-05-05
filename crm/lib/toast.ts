// Module-level toast bus. Components fire `toast.success(...)` etc. and the
// <Toaster /> mounted at the root subscribes and renders. No context
// provider needed — the bus lives at module scope so any client component
// can publish without prop-drilling or wrapping.

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastEvent {
  id: number;
  tone: ToastTone;
  message: string;
  durationMs: number;
}

type Listener = (event: ToastEvent) => void;

const listeners = new Set<Listener>();
let nextId = 1;

function publish(tone: ToastTone, message: string, durationMs: number) {
  const event: ToastEvent = { id: nextId++, tone, message, durationMs };
  for (const listener of listeners) listener(event);
}

export const toast = {
  success(message: string, durationMs = 3000) { publish('success', message, durationMs); },
  error(message: string, durationMs = 5000) { publish('error', message, durationMs); },
  info(message: string, durationMs = 3000) { publish('info', message, durationMs); },
};

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
