import React from 'react';
import { Copy, ExternalLink, FolderOpen, ListTree, Square, Terminal } from 'lucide-react';
import { ServiceInfo } from '../../../shared/types/service';
import { formatBytes, formatCpu, formatLatency } from '../utils/formatters';
import { CATEGORY_LABEL } from '../utils/frameworkIcons';
import {
  Badge,
  Button,
  CodeBlock,
  FrameworkTag,
  HEALTH,
  IconButton,
  Metric,
  Modal,
  StatusDot,
  SUPERVISOR_NAME,
  devSupervisorLabel
} from '../ui';
import { useToast } from './ToastContainer';

interface PortInspectorModalProps {
  service: ServiceInfo;
  onClose: () => void;
  onStop: (pid: number, force?: boolean) => void;
  onStopTree: (pid: number, force?: boolean) => void;
  onViewTree: (pid: number) => void;
}

/** A row of the detail list: fixed-width label, value that can wrap and be copied. */
const Row: React.FC<{
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ label, children, action }) => (
  <div className="flex items-start gap-3 border-b border-line py-2 last:border-0">
    <span className="w-36 shrink-0 pt-px text-xs text-muted">{label}</span>
    <div className="selectable min-w-0 flex-1 text-xs text-ink">{children}</div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const PortInspectorModal: React.FC<PortInspectorModalProps> = ({
  service,
  onClose,
  onStop,
  onStopTree,
  onViewTree
}) => {
  const { showToast } = useToast();
  const api = window.localhostManagerAPI;

  const copy = (label: string, text: string) => {
    api?.copyToClipboard(text);
    showToast(`Copied ${label}`, 'success');
  };

  return (
    <Modal
      size="lg"
      onClose={onClose}
      marker={
        <span className="tnum flex h-8 items-center rounded border border-line bg-sunken px-2 font-mono text-sm font-semibold text-ink">
          {service.port}
        </span>
      }
      title={service.projectName || service.processName}
      subtitle={service.url}
      actions={
        <IconButton label="Copy URL" size="sm" onClick={() => copy('URL', service.url)}>
          <Copy className="h-4 w-4" />
        </IconButton>
      }
      footer={
        <>
          <div className="flex items-center gap-1.5">
            <Button variant="primary" size="sm" onClick={() => api?.openInBrowser(service.url)}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
            {service.projectPath && (
              <Button size="sm" onClick={() => api?.openInTerminal(service.projectPath!)}>
                <Terminal className="h-3.5 w-3.5" />
                Terminal
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                onClose();
                onViewTree(service.pid);
              }}
            >
              <ListTree className="h-3.5 w-3.5" />
              Process tree
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* The narrow stop stays available, but it is the secondary action and says
                what it leaves behind — it is not what "Stop" should mean by default. */}
            <Button
              size="sm"
              variant="default"
              title={
                service.devSupervisor
                  ? `Leaves ${service.devSupervisor.name} (PID ${service.devSupervisor.pid}) running, which will start a replacement`
                  : 'Signals only this process, leaving any children running'
              }
              onClick={() => {
                onStop(service.pid, false);
                onClose();
              }}
            >
              This process only
            </Button>
            <Button
              size="sm"
              variant="danger"
              title={
                service.devSupervisor
                  ? `Stops ${service.devSupervisor.name} (PID ${service.devSupervisor.pid}) and the server beneath it`
                  : 'Stops this process and everything beneath it'
              }
              onClick={() => {
                onStopTree(service.pid, false);
                onClose();
              }}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3 rounded-lg border border-line bg-sunken/60 p-3">
          <div className="min-w-0">
            <div className="text-meta uppercase tracking-wide text-faint">State</div>
            <div className="mt-1 flex items-center gap-1.5">
              <StatusDot health={service.health} />
              <span className="truncate text-xs text-ink">{HEALTH[service.health].label}</span>
            </div>
          </div>
          <Metric label="Latency" value={formatLatency(service.responseTimeMs)} />
          <Metric label="CPU" value={formatCpu(service.cpu)} />
          <Metric label="Memory" value={formatBytes(service.memoryBytes)} />
        </div>

        <p className="text-meta text-muted">{HEALTH[service.health].note}.</p>

        <div>
          <Row label="Framework">
            {service.framework ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <FrameworkTag framework={service.framework} />
                <span className="text-muted">
                  {CATEGORY_LABEL[service.framework.category]}
                  {service.framework.packageManager && ` · ${service.framework.packageManager}`}
                  {service.framework.version && ` · ${service.framework.version}`}
                </span>
              </span>
            ) : (
              <span className="text-faint">Not detected</span>
            )}
          </Row>

          <Row label="Listening on">
            <span className="font-mono">
              {service.address}:{service.port}
            </span>{' '}
            <Badge mono className="ml-1 uppercase">
              {service.protocol}
            </Badge>
          </Row>

          <Row label="Process">
            <span className="font-mono">{service.processName}</span>
            <span className="tnum ml-2 text-muted">PID {service.pid}</span>
            {service.user && <span className="ml-2 text-muted">as {service.user}</span>}
          </Row>

          <Row label="Parent process">
            {service.ppid ? (
              <>
                <span className="font-mono">{service.parentProcessName || 'unknown'}</span>
                <span className="tnum ml-2 text-muted">PID {service.ppid}</span>
              </>
            ) : (
              <span className="text-faint">None</span>
            )}
          </Row>

          {service.isOrphan && (
            <Row label="Orphan check">
              <span className="text-warn">{service.orphanReason}</span>
            </Row>
          )}

          {service.supervisor && (
            <Row
              label="Supervised by"
              action={
                service.supervisor.stopHint ? (
                  <IconButton
                    label="Copy stop command"
                    size="sm"
                    onClick={() => copy('stop command', service.supervisor!.stopHint!)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </IconButton>
                ) : undefined
              }
            >
              <div>
                {SUPERVISOR_NAME[service.supervisor.kind]} as{' '}
                <span className="font-mono">{service.supervisor.label}</span>
              </div>
              <p className="mt-1 text-meta text-muted">
                Stopping it here only restarts it — the service manager relaunches it
                immediately.
                {service.supervisor.stopHint && ' To stop it for good, run:'}
              </p>
              {service.supervisor.stopHint && (
                <CodeBlock wrap className="mt-1.5">
                  {service.supervisor.stopHint}
                </CodeBlock>
              )}
            </Row>
          )}

          {!service.supervisor && service.devSupervisor && (
            <Row label="Parent job">
              <div>
                <span className="font-mono">{devSupervisorLabel(service.devSupervisor)}</span>{' '}
                <span className="text-faint">PID {service.devSupervisor.pid}</span>
              </div>
              <p className="mt-1 text-meta text-muted">
                This port is held by a child of that process. Stopping the child alone
                leaves the parent running — and if it is a watcher, it starts a replacement
                within seconds. Stop targets the parent, so the port stays free.
              </p>
              <CodeBlock wrap className="mt-1.5">
                {service.devSupervisor.commandLine}
              </CodeBlock>
            </Row>
          )}

          {service.projectPath && (
            <Row
              label="Working directory"
              action={
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label="Reveal in file manager"
                    size="sm"
                    onClick={() => api?.showItemInFolder(service.projectPath!)}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Copy path"
                    size="sm"
                    onClick={() => copy('path', service.projectPath!)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              }
            >
              <CodeBlock wrap>{service.projectPath}</CodeBlock>
            </Row>
          )}

          {service.executablePath && (
            <Row
              label="Executable"
              action={
                <IconButton
                  label="Copy executable path"
                  size="sm"
                  onClick={() => copy('executable path', service.executablePath)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </IconButton>
              }
            >
              <CodeBlock wrap>{service.executablePath}</CodeBlock>
            </Row>
          )}

          <Row
            label="Command"
            action={
              <IconButton
                label="Copy command"
                size="sm"
                onClick={() => copy('command', service.commandLine)}
              >
                <Copy className="h-3.5 w-3.5" />
              </IconButton>
            }
          >
            <CodeBlock wrap>{service.commandLine}</CodeBlock>
          </Row>
        </div>
      </div>
    </Modal>
  );
};
