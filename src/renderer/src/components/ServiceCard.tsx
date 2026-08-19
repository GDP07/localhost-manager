import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Info,
  ListTree,
  Square,
  Terminal
} from 'lucide-react';
import { ServiceInfo } from '../../../shared/types/service';
import { formatBytes, formatCpu, formatLatency, truncatePath } from '../utils/formatters';
import { cn } from '../utils/cn';
import {
  Button,
  CodeBlock,
  FrameworkTag,
  HealthBadge,
  IconButton,
  Menu,
  Metric,
  StatusDot,
  SupervisorBadge,
  DevSupervisorBadge,
  devSupervisorLabel,
  devSupervisorExplanation,
  supervisorExplanation
} from '../ui';
import { useToast } from './ToastContainer';

interface ServiceCardProps {
  service: ServiceInfo;
  onInspect: (service: ServiceInfo) => void;
  onViewTree: (pid: number) => void;
  onStop: (pid: number, force?: boolean) => void;
  onStopTree: (pid: number, force?: boolean) => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onInspect,
  onViewTree,
  onStop,
  onStopTree
}) => {
  const { showToast } = useToast();
  const [stopping, setStopping] = useState(false);
  const api = window.localhostManagerAPI;

  const handleCopyUrl = () => {
    api?.copyToClipboard(service.url);
    showToast(`Copied ${service.url}`, 'success');
  };

  const handleOpenTerminal = () => {
    if (!service.projectPath) {
      showToast('No working directory detected for this process', 'error');
      return;
    }
    api?.openInTerminal(service.projectPath);
  };

  /**
   * `job` stops the supervisor and everything under it, which is the only action that
   * holds when something is watching the port holder. `only` is the surgical escape
   * hatch, and says so in the menu rather than pretending to be a stop.
   */
  const runStop = async (action: 'job' | 'force' | 'only') => {
    setStopping(true);
    try {
      if (action === 'only') await onStop(service.pid, false);
      else await onStopTree(service.pid, action === 'force');
    } catch {
      showToast(`Could not stop PID ${service.pid}`, 'error');
    } finally {
      setStopping(false);
    }
  };

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-surface transition-colors',
        service.isOrphan ? 'border-warn/40' : 'border-line hover:border-line-strong'
      )}
    >
      {/* Identity: port, framework, state */}
      <div className="flex items-start gap-2.5 p-3">
        <StatusDot health={service.health} className="mt-[7px]" />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={handleCopyUrl}
              title={`Copy ${service.url}`}
              className="tnum font-mono text-base font-semibold leading-none text-ink transition-colors hover:text-accent"
            >
              {service.port}
            </button>
            <FrameworkTag framework={service.framework} protocol={service.protocol} />
            {service.supervisor && <SupervisorBadge supervisor={service.supervisor} />}
            {!service.supervisor && service.devSupervisor && (
              <DevSupervisorBadge supervisor={service.devSupervisor} />
            )}
          </div>

          <div className="mt-1.5 min-w-0">
            <div className="truncate text-xs font-medium text-ink">
              {service.projectName || service.processName}
            </div>
            <div
              className="truncate font-mono text-meta text-faint"
              title={service.projectPath || undefined}
            >
              {service.projectPath ? truncatePath(service.projectPath, 2) : 'No working directory'}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <HealthBadge health={service.health} />
          {service.responseTimeMs !== null && (
            <div className="tnum mt-1 font-mono text-meta text-faint">
              {formatLatency(service.responseTimeMs)}
            </div>
          )}
        </div>
      </div>

      {service.isOrphan ? (
        <div
          className="flex items-start gap-1.5 border-y border-warn/25 bg-warn/[0.07] px-3 py-1.5 text-meta text-warn"
          title={service.orphanReason || undefined}
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span className="truncate">Parent process is gone — likely a leftover from a closed terminal</span>
        </div>
      ) : service.supervisor?.stopHint ? (
        <div
          className="flex items-start gap-1.5 border-y border-line bg-sunken/60 px-3 py-1.5 text-meta text-muted"
          title={supervisorExplanation(service.supervisor)}
        >
          <span className="shrink-0">Stops for good with</span>
          <code className="selectable truncate font-mono text-ink">{service.supervisor.stopHint}</code>
        </div>
      ) : service.devSupervisor ? (
        <div
          className="flex items-start gap-1.5 border-y border-line bg-sunken/60 px-3 py-1.5 text-meta text-muted"
          title={devSupervisorExplanation(service.devSupervisor)}
        >
          <span className="shrink-0">Started by</span>
          <code className="selectable truncate font-mono text-ink">
            {devSupervisorLabel(service.devSupervisor)}
          </code>
          <span className="shrink-0">— Stop targets PID {service.devSupervisor.pid}</span>
        </div>
      ) : null}

      <div className="space-y-2.5 px-3 pb-3">
        <CodeBlock title={service.commandLine} className="selectable">
          {service.commandLine}
        </CodeBlock>

        <div className="grid grid-cols-3 gap-3">
          <Metric label="CPU" value={formatCpu(service.cpu)} />
          <Metric label="Memory" value={formatBytes(service.memoryBytes)} />
          <Metric label="PID" value={service.pid} />
        </div>
      </div>

      <div className="mt-auto flex items-center gap-1 border-t border-line px-2 py-2">
        <Button size="sm" onClick={() => api?.openInBrowser(service.url)}>
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </Button>

        <IconButton
          label="Open terminal in project directory"
          size="sm"
          disabled={!service.projectPath}
          onClick={handleOpenTerminal}
        >
          <Terminal className="h-3.5 w-3.5" />
        </IconButton>

        <IconButton label="Process tree" size="sm" onClick={() => onViewTree(service.pid)}>
          <ListTree className="h-3.5 w-3.5" />
        </IconButton>

        <IconButton label="Inspect port" size="sm" onClick={() => onInspect(service)}>
          <Info className="h-3.5 w-3.5" />
        </IconButton>

        <div className="flex-1" />

        {/* Split control: the common action is one click, escalation is one more. */}
        <div className="flex items-center">
          <Button
            size="sm"
            variant="danger-quiet"
            disabled={stopping}
            onClick={() => runStop('job')}
            className="rounded-r-none border-r-0"
          >
            <Square className="h-3 w-3 fill-current" />
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
          <Menu
            side="top"
            items={[
              {
                label: service.supervisor ? 'Restart (it will relaunch)' : 'Graceful stop',
                note: service.devSupervisor ? 'SIGTERM to the job' : 'SIGTERM',
                onSelect: () => runStop('job')
              },
              {
                label: 'Stop this process only',
                note: service.devSupervisor ? 'it will be respawned' : 'leaves children running',
                tone: 'warn',
                onSelect: () => runStop('only')
              },
              { label: 'Force kill', note: 'SIGKILL', tone: 'danger', onSelect: () => runStop('force') }
            ]}
            trigger={({ toggle }) => (
              <IconButton
                label="More stop options"
                size="sm"
                variant="danger-quiet"
                onClick={toggle}
                className="w-6 rounded-l-none"
              >
                <ChevronDown className="h-3 w-3" />
              </IconButton>
            )}
          />
        </div>
      </div>
    </article>
  );
};
