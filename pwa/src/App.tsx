/**
 * DevBridge PWA — Root App with bottom-nav routing
 */
import { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import type { Settings } from './types';
import { loadSettings, saveSettings } from './settings';
import { useWebSocket } from './hooks/useWebSocket';
import Dashboard from './screens/Dashboard';
import Chat from './screens/Chat';
import Codebase from './screens/Codebase';
import Preview from './screens/Preview';
import SettingsScreen from './screens/Settings';

// ── Context ────────────────────────────────────────────────────
interface AppCtx {
  settings: Settings;
  updateSettings: (s: Settings) => void;
  wsState: ReturnType<typeof useWebSocket>;
}
const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

// ── Nav items ──────────────────────────────────────────────────
const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/chat', label: 'Chat', icon: '💬' },
  { to: '/codebase', label: 'Files', icon: '📁' },
  { to: '/preview', label: 'Preview', icon: '📱' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const wsState = useWebSocket(settings);

  return (
    <Ctx.Provider value={{ settings, updateSettings, wsState }}>
      <BrowserRouter>
        <div className="flex flex-col h-full bg-surface">
          {/* Page content — scrollable */}
          <main className="flex-1 overflow-y-auto safe-top">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/codebase" element={<Codebase />} />
              <Route path="/preview" element={<Preview />} />
              <Route path="/settings" element={<SettingsScreen />} />
            </Routes>
          </main>

          {/* Bottom navigation */}
          <nav className="flex border-t border-slate-700 bg-surface-2 safe-bottom">
            {NAV.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center py-2 text-xs gap-0.5 transition-colors ${
                    isActive ? 'text-accent' : 'text-slate-400 active:text-slate-200'
                  }`
                }
              >
                <span className="text-lg leading-none">{icon}</span>
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </BrowserRouter>
    </Ctx.Provider>
  );
}
