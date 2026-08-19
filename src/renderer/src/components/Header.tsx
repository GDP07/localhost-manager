import React from 'react';
import { Command, Moon, RefreshCw, Search, Settings, Sun, X } from 'lucide-react';
import { Theme } from '../hooks/useTheme';
import { cn } from '../utils/cn';
import { IconButton } from '../ui';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  loading: boolean;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  activeTab: 'services' | 'workspaces';
  onTabChange: (tab: 'services' | 'workspaces') => void;
  resolvedTheme: 'dark' | 'light';
  onToggleTheme: () => void;
  theme: Theme;
  devCount: number;
  workspaceCount: number;
}

const Tab: React.FC<{
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, count, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={cn(
      'relative flex h-full items-center gap-1.5 px-1 text-xs font-medium transition-colors',
      // The active tab is marked by a rule aligned to the header's own bottom border.
      'after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:rounded-full',
      active
        ? 'text-ink after:bg-accent'
        : 'text-muted hover:text-ink after:bg-transparent'
    )}
  >
    {children}
    {count !== undefined && count > 0 && (
      <span className="tnum font-mono text-meta text-faint">{count}</span>
    )}
  </button>
);

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRefresh,
  loading,
  onOpenCommandPalette,
  onOpenSettings,
  activeTab,
  onTabChange,
  resolvedTheme,
  onToggleTheme,
  theme,
  devCount,
  workspaceCount
}) => (
  <header className="titlebar-drag flex h-12 shrink-0 items-stretch gap-5 border-b border-line bg-surface pl-[88px] pr-3">
    {/* Brand: a port glyph, which is what this app is actually about. */}
    <div className="titlebar-no-drag flex items-center gap-2">
      <span className="font-mono text-sm font-semibold tracking-tight text-accent">:</span>
      <span className="text-xs font-semibold tracking-tight text-ink">Localhost</span>
    </div>

    <nav className="titlebar-no-drag flex items-stretch gap-4">
      <Tab
        active={activeTab === 'services'}
        count={devCount}
        onClick={() => onTabChange('services')}
      >
        Services
      </Tab>
      <Tab
        active={activeTab === 'workspaces'}
        count={workspaceCount}
        onClick={() => onTabChange('workspaces')}
      >
        Workspaces
      </Tab>
    </nav>

    <div className="flex-1" />

    <div className="titlebar-no-drag flex items-center gap-1.5">
      {/* Filters the service list, so it has no meaning on the workspaces tab. */}
      {activeTab === 'services' && (
      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter services"
          aria-label="Filter services"
          className={cn(
            'h-7 w-full rounded border border-line bg-canvas pl-8 pr-8 text-xs text-ink',
            'placeholder:text-faint transition-colors hover:border-line-strong',
            'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'
          )}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear filter"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      )}

      <IconButton
        label="Command palette (⌘K)"
        size="sm"
        onClick={onOpenCommandPalette}
      >
        <Command className="h-4 w-4" />
      </IconButton>

      <IconButton
        label={loading ? 'Refreshing…' : 'Refresh now (⌘R)'}
        size="sm"
        disabled={loading}
        onClick={onRefresh}
      >
        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
      </IconButton>

      <IconButton
        label={`Theme: ${theme}`}
        size="sm"
        onClick={onToggleTheme}
      >
        {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </IconButton>

      <IconButton label="Settings" size="sm" onClick={onOpenSettings}>
        <Settings className="h-4 w-4" />
      </IconButton>
    </div>
  </header>
);
