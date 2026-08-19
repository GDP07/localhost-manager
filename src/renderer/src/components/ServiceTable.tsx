import React from 'react';
import { AlertTriangle, ExternalLink, Info, ListTree, Square, Terminal } from 'lucide-react';
import { ServiceInfo } from '../../../shared/types/service';
import { formatBytes, formatCpu, truncatePath } from '../utils/formatters';
import {
  DevSupervisorBadge,
  FrameworkTag,
  HealthBadge,
  IconButton,
  StatusDot,
  SupervisorBadge
} from '../ui';
import { useToast } from './ToastContainer';

interface ServiceTableProps {
  services: ServiceInfo[];
  onInspect: (service: ServiceInfo) => void;
  onViewTree: (pid: number) => void;
  /** Stops the whole job, supervisor included — the row has no menu to offer a choice. */
  onStopJob: (pid: number, force?: boolean) => void;
}

const TH: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className
}) => (
  <th
    scope="col"
    className={`px-3 py-2 text-left text-meta font-medium uppercase tracking-wide text-faint ${className ?? ''}`}
  >
    {children}
  </th>
);

export const ServiceTable: React.FC<ServiceTableProps> = ({
  services,
  onInspect,
  onViewTree,
  onStopJob
}) => {
  const { showToast } = useToast();
  const api = window.localhostManagerAPI;

  const handleCopyUrl = (url: string) => {
    api?.copyToClipboard(url);
    showToast(`Copied ${url}`, 'success');
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-collapse">
          {/* Sticky header keeps column meaning while scrolling a long port list. */}
          <thead className="sticky top-0 z-10 bg-sunken">
            <tr className="border-b border-line">
              <TH>Port</TH>
              <TH>Framework</TH>
              <TH>Project</TH>
              <TH>Process</TH>
              <TH className="text-right">CPU</TH>
              <TH className="text-right">Memory</TH>
              <TH>State</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr
                key={service.id}
                className="border-b border-line/70 transition-colors last:border-0 hover:bg-sunken/60"
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <StatusDot health={service.health} />
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(service.url)}
                      title={`Copy ${service.url}`}
                      className="tnum font-mono text-xs font-semibold text-ink transition-colors hover:text-accent"
                    >
                      {service.port}
                    </button>
                    {service.isOrphan && (
                      <span title={service.orphanReason || 'Orphaned process'}>
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warn" />
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1">
                    <FrameworkTag framework={service.framework} protocol={service.protocol} />
                    {service.supervisor && <SupervisorBadge supervisor={service.supervisor} />}
                    {!service.supervisor && service.devSupervisor && (
                      <DevSupervisorBadge supervisor={service.devSupervisor} />
                    )}
                  </div>
                </td>

                <td className="max-w-[220px] px-3 py-1.5">
                  <div className="truncate text-xs text-ink">
                    {service.projectName || <span className="text-faint">—</span>}
                  </div>
                  {service.projectPath && (
                    <div
                      className="truncate font-mono text-meta text-faint"
                      title={service.projectPath}
                    >
                      {truncatePath(service.projectPath, 2)}
                    </div>
                  )}
                </td>

                <td className="max-w-[200px] px-3 py-1.5">
                  <div className="truncate font-mono text-xs text-ink">{service.processName}</div>
                  <div className="tnum font-mono text-meta text-faint">PID {service.pid}</div>
                </td>

                <td className="tnum px-3 py-1.5 text-right font-mono text-xs text-muted">
                  {formatCpu(service.cpu)}
                </td>

                <td className="tnum px-3 py-1.5 text-right font-mono text-xs text-muted">
                  {formatBytes(service.memoryBytes)}
                </td>

                <td className="px-3 py-1.5">
                  <HealthBadge health={service.health} />
                </td>

                <td className="px-2 py-1.5">
                  {/* Row actions stay visible: hover-only controls are undiscoverable. */}
                  <div className="flex items-center justify-end gap-0.5">
                    <IconButton
                      label="Open in browser"
                      size="sm"
                      onClick={() => api?.openInBrowser(service.url)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Open terminal in project directory"
                      size="sm"
                      disabled={!service.projectPath}
                      onClick={() => service.projectPath && api?.openInTerminal(service.projectPath)}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="Process tree"
                      size="sm"
                      onClick={() => onViewTree(service.pid)}
                    >
                      <ListTree className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Inspect port" size="sm" onClick={() => onInspect(service)}>
                      <Info className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={
                        service.devSupervisor
                          ? `Stop ${service.devSupervisor.name} (PID ${service.devSupervisor.pid}) and its server`
                          : 'Stop process'
                      }
                      size="sm"
                      className="text-danger hover:bg-danger/10 hover:text-danger"
                      onClick={() => onStopJob(service.pid, false)}
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
