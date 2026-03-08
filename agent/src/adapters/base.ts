/**
 * DevBridge Agent — Base Adapter interface
 */

export interface SendOptions {
  text: string;
  tool?: string;
  target?: string;
}

export interface Adapter {
  readonly id: string;
  readonly label: string;
  isActive(): boolean;
  isAvailable?(): boolean;
  unavailableReason?(): string | null;
  send(opts: SendOptions): void;
  runAction(action: string, args: string[]): Promise<void>;
  getPreviewUrl(): string | null;
  destroy(): void;
}
