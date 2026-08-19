import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Filter,
  OctagonX,
  Play,
  RefreshCw,
  Settings,
  Square,
  Terminal
} from 'lucide-react';
import { ServiceInfo } from '../../../shared/types/service';
import { Workspace } from '../../../shared/types/workspace';
import { cn } from '../utils/cn';
import { Kbd } from '../ui';

interface CommandPaletteProps {
  services: ServiceInfo[];
  workspaces: Workspace[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenStopAll: () => void;
  onSetCategoryFilter: (category: string) => void;
  onStartWorkspace: (id: string) => void;
  onStopService: (pid: number) => void;
}

type Group = 'Actions' | 'Workspaces' | 'Services';

interface Item {
  id: string;
  group: Group;
  title: string;
  detail?: string;
  /** Extra text matched against the query but not displayed. */
  keywords?: string;
  icon: React.ReactNode;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  services,
  workspaces,
  onClose,
  onRefresh,
  onOpenSettings,
  onOpenStopAll,
  onSetCategoryFilter,
  onStartWorkspace,
  onStopService
}) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const api = window.localhostManagerAPI;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      {
        id: 'refresh',
        group: 'Actions',
        title: 'Refresh ports',
        detail: 'Rescan listening sockets and processes',
        icon: <RefreshCw className="h-3.5 w-3.5" />,
        run: onRefresh
      },
      {
        id: 'stop-all',
        group: 'Actions',
        title: 'Stop all development processes',
        icon: <OctagonX className="h-3.5 w-3.5" />,
        run: onOpenStopAll
      },
      {
        id: 'orphans',
        group: 'Actions',
        title: 'Show orphaned processes',
        detail: 'Dev processes whose parent terminal has closed',
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        run: () => onSetCategoryFilter('orphans')
      },
      {
        id: 'databases',
        group: 'Actions',
        title: 'Show databases only',
        keywords: 'postgres redis mongo mysql filter',
        icon: <Filter className="h-3.5 w-3.5" />,
        run: () => onSetCategoryFilter('database')
      },
      {
        id: 'settings',
        group: 'Actions',
        title: 'Settings',
        icon: <Settings className="h-3.5 w-3.5" />,
        run: onOpenSettings
      }
    ];

    const workspaceItems: Item[] = workspaces
      .filter((ws) => ws.status !== 'running')
      .map((ws) => ({
        id: `ws-${ws.id}`,
        group: 'Workspaces',
        title: `Start ${ws.name}`,
        detail: `${ws.commands.length} ${ws.commands.length === 1 ? 'command' : 'commands'} · ${ws.directory}`,
        icon: <Play className="h-3.5 w-3.5" />,
        run: () => onStartWorkspace(ws.id)
      }));

    // Three verbs per service, so a port typed into the palette offers everything
    // you would want to do with it without leaving the keyboard.
    const serviceItems: Item[] = services.flatMap((s) => {
      const name = s.projectName || s.processName;
      const entries: Item[] = [
        {
          id: `open-${s.id}`,
          group: 'Services',
          title: `Open ${s.port}`,
          detail: `${name} · ${s.url}`,
          keywords: `${s.framework?.name ?? ''} browser ${s.pid}`,
          icon: <ExternalLink className="h-3.5 w-3.5" />,
          run: () => api?.openInBrowser(s.url)
        },
        {
          id: `stop-${s.id}`,
          group: 'Services',
          title: `Stop ${s.port}`,
          detail: `${name} · PID ${s.pid}`,
          keywords: 'kill terminate',
          icon: <Square className="h-3 w-3 fill-current" />,
          run: () => onStopService(s.pid)
        }
      ];

      if (s.projectPath) {
        entries.push({
          id: `term-${s.id}`,
          group: 'Services',
          title: `Terminal for ${s.port}`,
          detail: s.projectPath,
          keywords: `shell cd ${name}`,
          icon: <Terminal className="h-3.5 w-3.5" />,
          run: () => api?.openInTerminal(s.projectPath!)
        });
      }

      return entries;
    });

    return [...actions, ...workspaceItems, ...serviceItems];
  }, [
    api,
    onOpenSettings,
    onOpenStopAll,
    onRefresh,
    onSetCategoryFilter,
    onStartWorkspace,
    onStopService,
    services,
    workspaces
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.title} ${item.detail ?? ''} ${item.keywords ?? ''} ${item.group}`
        .toLowerCase()
        .includes(q)
    );
  }, [items, query]);

  // Keep the highlighted row in view as the selection moves by keyboard.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const commit = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(filtered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup: Group | null = null;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-black/45 p-6 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-xl animate-panel-in flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <span className="font-mono text-sm text-faint">›</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search ports, workspaces and actions"
            aria-label="Command palette"
            className="h-11 w-full bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-0"
          />
        </div>

        <ul ref={listRef} className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <li className="px-2 py-8 text-center text-xs text-faint">
              Nothing matches “{query}”
            </li>
          )}

          {filtered.map((item, idx) => {
            const showHeading = item.group !== lastGroup;
            lastGroup = item.group;

            return (
              <React.Fragment key={item.id}>
                {showHeading && (
                  <li className="px-2 pb-1 pt-2.5 text-meta font-medium uppercase tracking-wide text-faint">
                    {item.group}
                  </li>
                )}
                <li
                  data-index={idx}
                  role="option"
                  aria-selected={idx === active}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => commit(item)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 transition-colors',
                    idx === active ? 'bg-accent text-accent-ink' : 'text-ink hover:bg-sunken'
                  )}
                >
                  <span className={cn('shrink-0', idx === active ? 'text-accent-ink' : 'text-faint')}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.title}</span>
                    {item.detail && (
                      <span
                        className={cn(
                          'block truncate font-mono text-meta',
                          idx === active ? 'text-accent-ink/75' : 'text-faint'
                        )}
                      >
                        {item.detail}
                      </span>
                    )}
                  </span>
                </li>
              </React.Fragment>
            );
          })}
        </ul>

        <div className="flex items-center gap-3 border-t border-line bg-sunken/60 px-3 py-2 text-meta text-faint">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd>
            run
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd>
            dismiss
          </span>
          <span className="ml-auto tnum">
            {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
};
