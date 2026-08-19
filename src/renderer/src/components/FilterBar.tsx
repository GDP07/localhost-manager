import React from 'react';
import { LayoutGrid, Rows3, FolderTree } from 'lucide-react';
import { HealthStatus } from '../../../shared/types/service';
import { cn } from '../utils/cn';
import { HEALTH, Select } from '../ui';

export type ViewMode = 'cards' | 'table' | 'grouped';

interface FilterBarProps {
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  healthFilter: string;
  onHealthChange: (health: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  totalVisible: number;
  totalServices: number;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'node', label: 'Node' },
  { id: 'python', label: 'Python' },
  { id: 'php', label: 'PHP' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'database', label: 'Databases' },
  { id: 'orphans', label: 'Orphans' }
];

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'cards', label: 'Cards', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { id: 'table', label: 'Table', icon: <Rows3 className="h-3.5 w-3.5" /> },
  { id: 'grouped', label: 'Grouped by project', icon: <FolderTree className="h-3.5 w-3.5" /> }
];

const HEALTH_OPTIONS: HealthStatus[] = ['healthy', 'starting', 'unreachable', 'unknown'];

export const FilterBar: React.FC<FilterBarProps> = ({
  categoryFilter,
  onCategoryChange,
  healthFilter,
  onHealthChange,
  viewMode,
  onViewModeChange,
  totalVisible,
  totalServices
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2">
    <div className="scroll-thin flex items-center gap-0.5 overflow-x-auto">
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onCategoryChange(cat.id)}
          className={cn(
            'h-7 whitespace-nowrap rounded px-2 text-xs font-medium transition-colors',
            categoryFilter === cat.id
              ? 'bg-sunken text-ink'
              : 'text-muted hover:bg-sunken/70 hover:text-ink'
          )}
        >
          {cat.label}
        </button>
      ))}
    </div>

    <div className="flex-1" />

    <span className="tnum text-meta text-faint">
      {totalVisible === totalServices
        ? `${totalVisible} shown`
        : `${totalVisible} of ${totalServices} shown`}
    </span>

    <Select
      value={healthFilter}
      onChange={(e) => onHealthChange(e.target.value)}
      aria-label="Filter by health"
      className="h-7 w-auto"
    >
      <option value="all">Any state</option>
      {HEALTH_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {HEALTH[status].label}
        </option>
      ))}
    </Select>

    {/* Segmented control: one border around the group, not around each button. */}
    <div className="flex items-center gap-0.5 rounded border border-line p-0.5">
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onViewModeChange(view.id)}
          title={view.label}
          aria-label={view.label}
          aria-pressed={viewMode === view.id}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded transition-colors',
            viewMode === view.id
              ? 'bg-sunken text-ink'
              : 'text-faint hover:text-ink'
          )}
        >
          {view.icon}
        </button>
      ))}
    </div>
  </div>
);
