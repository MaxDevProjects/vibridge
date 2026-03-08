/**
 * DevBridge PWA — Codebase browser screen
 */
import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { agentBaseUrl } from '../settings';
import type { FileNode } from '../types';

type ViewMode = 'tree' | 'file';

function TreeNode({ node, onSelect, depth = 0 }: {
  node: FileNode;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);

  if (node.type === 'file') {
    return (
      <button
        className="flex items-center w-full text-left px-2 py-1 text-sm hover:bg-slate-700 rounded gap-1 text-slate-300"
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        onClick={() => onSelect(node.path)}
      >
        <span className="text-slate-500 text-xs">📄</span>
        {node.name}
      </button>
    );
  }

  return (
    <div>
      <button
        className="flex items-center w-full text-left px-2 py-1 text-sm font-medium hover:bg-slate-700 rounded gap-1"
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs text-slate-400">{open ? '▾' : '▸'}</span>
        <span className="text-xs">📂</span>
        {node.name}
      </button>
      {open && node.children?.map((child) => (
        <TreeNode key={child.path} node={child} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function Codebase() {
  const { settings } = useApp();
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('tree');
  const [selectedPath, setSelectedPath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  const base = agentBaseUrl(settings);
  const headers = { Authorization: `Bearer ${settings.pairingToken ?? ''}` };

  const loadTree = () => {
    setLoading(true);
    fetch(`${base}/files`, { headers })
      .then((r) => r.json() as Promise<FileNode>)
      .then((data) => { setTree(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(loadTree, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const openFile = (path: string) => {
    setSelectedPath(path);
    setView('file');
    setFileLoading(true);
    fetch(`${base}/files/${encodeURIComponent(path)}`, { headers })
      .then((r) => r.json() as Promise<{ content: string }>)
      .then(({ content }) => { setFileContent(content); setFileLoading(false); })
      .catch(() => { setFileContent('Error loading file.'); setFileLoading(false); });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-700 bg-surface-2 flex items-center gap-3">
        {view === 'file' ? (
          <>
            <button className="text-accent" onClick={() => setView('tree')}>← Back</button>
            <span className="text-sm font-mono truncate flex-1 text-slate-400">{selectedPath}</span>
          </>
        ) : (
          <>
            <h2 className="font-semibold flex-1">Codebase</h2>
            <button
              onClick={loadTree}
              className="text-xs text-slate-400 active:text-white"
            >
              ↻
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === 'tree' ? (
          loading ? (
            <p className="text-center text-slate-500 text-sm mt-10">Loading…</p>
          ) : tree ? (
            <div className="py-2 px-2">
              {tree.children?.map((node) => (
                <TreeNode key={node.path} node={node} onSelect={openFile} />
              ))}
            </div>
          ) : (
            <p className="text-center text-slate-500 text-sm mt-10">
              Not connected or workspace empty.
            </p>
          )
        ) : (
          fileLoading ? (
            <p className="text-center text-slate-500 text-sm mt-10">Loading file…</p>
          ) : (
            <pre className="p-4 text-xs font-mono text-slate-300 whitespace-pre-wrap break-all">
              {fileContent}
            </pre>
          )
        )}
      </div>
    </div>
  );
}
