/**
 * DevBridge PWA — App Preview screen
 * Displays the dev server running on the PC in an iframe.
 * Auto-detects the preview URL via /preview-url endpoint.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import { agentBaseUrl } from '../settings';

export default function Preview() {
  const { settings, wsState } = useApp();
  const { onMessage } = wsState;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const base = agentBaseUrl(settings);

  // Fetch preview URL from agent
  const fetchPreviewUrl = () => {
    setLoading(true);
    fetch(`${base}/preview-url`, {
      headers: { Authorization: `Bearer ${settings.pairingToken ?? ''}` },
    })
      .then((r) => r.json() as Promise<{ url: string | null }>)
      .then(({ url }) => {
        if (url) setPreviewUrl(url);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(fetchPreviewUrl, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for rebuild events → auto-refresh iframe
  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === 'file_changed' && iframeRef.current) {
        // Debounce: only reload on .ts/.tsx/.css changes
        if (/\.(ts|tsx|css|html)$/.test((msg.path as string) ?? '')) {
          setTimeout(() => {
            if (iframeRef.current) {
              // eslint-disable-next-line no-self-assign
              iframeRef.current.src = iframeRef.current.src;
            }
          }, 1_200);
        }
      }
    });
  }, [onMessage]);

  const activeUrl = customUrl || previewUrl;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 bg-surface-2 flex items-center gap-2">
        <input
          className="flex-1 bg-surface rounded-lg px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-accent text-slate-300"
          placeholder="http://localhost:5173"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
        />
        <button
          className="text-xs bg-accent text-white px-3 py-1.5 rounded-lg"
          onClick={() => fetchPreviewUrl()}
        >
          Detect
        </button>
        <button
          className="text-slate-400 text-sm active:text-white"
          onClick={() => {
            if (iframeRef.current) {
              // eslint-disable-next-line no-self-assign
              iframeRef.current.src = iframeRef.current.src;
            }
          }}
        >
          ↻
        </button>
      </div>

      {/* Preview frame */}
      <div className="flex-1 bg-white relative">
        {!activeUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface">
            <p className="text-slate-400 text-sm">
              {loading ? 'Detecting…' : 'No preview URL detected'}
            </p>
            {!loading && (
              <button
                className="text-accent text-sm"
                onClick={fetchPreviewUrl}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={activeUrl}
            className="w-full h-full border-0"
            title="App Preview"
            allow="camera; microphone; geolocation"
          />
        )}
      </div>
    </div>
  );
}
