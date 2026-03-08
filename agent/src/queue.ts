/**
 * DevBridge Agent — Message Queue
 * Holds in-flight messages and broadcasts output to listeners.
 */

export interface OutputPayload {
  type: string;
  text?: string;
  tool?: string;
  isQuestion?: boolean;
  data?: unknown;
}

type OutputListener = (payload: OutputPayload) => void;

export class MessageQueue {
  private listeners = new Set<OutputListener>();
  private history: OutputPayload[] = [];
  private maxHistory = 200;

  /** Emit a payload to all registered listeners */
  emit(payload: OutputPayload): void {
    this.history.push(payload);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.listeners.forEach((fn) => fn(payload));
  }

  /** Register a listener; returns an unsubscribe function */
  onOutput(fn: OutputListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getHistory(limit = 50): OutputPayload[] {
    return this.history.slice(-limit);
  }

  clear(): void {
    this.history = [];
  }
}
