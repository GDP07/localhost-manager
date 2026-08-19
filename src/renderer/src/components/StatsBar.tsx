import React from 'react';
import { AlertTriangle, ListTree, OctagonX } from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import { Button } from '../ui';

interface StatsBarProps {
  stats: {
    totalPorts: number;
    devServicesCount: number;
    projectsCount: number;
    totalMemoryBytes: number;
    orphanCount: number;
  };
  onFilterOrphans: () => void;
  onOpenSummary: () => void;
  onOpenStopAll: () => void;
}

/** Figure first, label second — the number is what you scan for. */
const Stat: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="tnum font-mono text-xs font-semibold text-ink">{value}</span>
    <span className="text-meta text-muted">{label}</span>
  </div>
);

export const StatsBar: React.FC<StatsBarProps> = ({
  stats,
  onFilterOrphans,
  onOpenSummary,
  onOpenStopAll
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-2">
    <Stat value={stats.totalPorts} label={stats.totalPorts === 1 ? 'port' : 'ports'} />
    <Stat value={stats.devServicesCount} label="dev" />
    <Stat value={stats.projectsCount} label={stats.projectsCount === 1 ? 'project' : 'projects'} />
    <Stat value={formatBytes(stats.totalMemoryBytes)} label="resident" />

    {stats.orphanCount > 0 && (
      <button
        type="button"
        onClick={onFilterOrphans}
        className="flex items-center gap-1.5 rounded text-meta text-warn transition-colors hover:underline"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          {stats.orphanCount} orphaned {stats.orphanCount === 1 ? 'process' : 'processes'}
        </span>
      </button>
    )}

    <div className="flex-1" />

    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="subtle" onClick={onOpenSummary}>
        <ListTree className="h-3.5 w-3.5" />
        Summary
      </Button>
      {stats.devServicesCount > 0 && (
        <Button size="sm" variant="danger-quiet" onClick={onOpenStopAll}>
          <OctagonX className="h-3.5 w-3.5" />
          Stop all dev
        </Button>
      )}
    </div>
  </div>
);
