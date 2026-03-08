/**
 * DevBridge PWA — WebSocket hook
 * Manages connection lifecycle, auth, and message dispatch.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { Settings, WsMessage } from '../types';
import { agentWsUrl } from '../settings';

export type WsStatus = 'disconnected' | 'connecting' | 'connected';

type MessageListener = (msg: WsMessage) => void;

export function useWebSocket(settings: Settings) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<MessageListener>());
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1_000);

  const connect = useCallback(() => {
    const token = settings.pairingToken;
    if (!token) {
      setStatus('disconnected');
      return;
    }

    const url = agentWsUrl(settings);
    setStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.onmessage = (ev) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(ev.data as string) as WsMessage;
      } catch {
        return;
      }
      if (msg.type === 'auth_ok') {
        setStatus('connected');
        retryDelay.current = 1_000;
      }
      listenersRef.current.forEach((fn) => fn(msg));
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
      retryRef.current = setTimeout(connect, retryDelay.current);
    };

    ws.onerror = () => ws.close();
  }, [settings]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const onMessage = useCallback((fn: MessageListener): (() => void) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  return { status, send, onMessage };
}
