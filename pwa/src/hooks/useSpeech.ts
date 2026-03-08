/**
 * DevBridge PWA — Web Speech API hook (STT)
 */
import { useCallback, useRef, useState } from 'react';

export type SpeechState = 'idle' | 'listening' | 'unsupported';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySR = any;

const getSpeechClass = (): (new () => AnySR) | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export function useSpeech(onResult: (text: string) => void) {
  const [state, setState] = useState<SpeechState>(
    () => (getSpeechClass() ? 'idle' : 'unsupported')
  );

  const recRef = useRef<AnySR>(null);

  const start = useCallback(() => {
    const Cls = getSpeechClass();
    if (!Cls) return;

    const rec: AnySR = new Cls();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const text: string = e.results[0]?.[0]?.transcript ?? '';
      if (text) onResult(text);
    };
    rec.onend = () => setState('idle');
    rec.onerror = () => setState('idle');

    recRef.current = rec;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    rec.start();
    setState('listening');
  }, [onResult]);

  const stop = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    recRef.current?.stop?.();
    setState('idle');
  }, []);

  return { state, start, stop };
}

