import React from 'react';
import { ServiceInfo } from '../../../shared/types/service';
import { formatBytes } from '../utils/formatters';
import { Button, FrameworkTag, Modal } from '../ui';

interface StopAllConfirmModalProps {
  services: ServiceInfo[];
  onClose: () => void;
  onConfirm: () => void;
}

export const StopAllConfirmModal: React.FC<StopAllConfirmModalProps> = ({
  services,
  onClose,
  onConfirm
}) => {
  const allDev = services.filter((s) => s.isDevProcess);
  // Supervised services are skipped in the main process because the service manager
  // restarts them instantly; say so rather than quietly leaving them out.
  const devServices = allDev.filter((s) => !s.supervisor);
  const supervised = allDev.filter((s) => s.supervisor);
  // One job can hold several ports, and a supervised port holder is stopped by way of
  // its supervisor. The count is per job, so it matches what actually gets stopped.
  const jobCount = new Set(devServices.map((s) => s.devSupervisor?.pid ?? s.pid)).size;
  const supervisedByParent = devServices.filter((s) => s.devSupervisor).length;

  return (
    <Modal
      onClose={onClose}
      title="Stop all development processes"
      subtitle={`${jobCount} ${jobCount === 1 ? 'process' : 'processes'} will be sent SIGTERM, supervisors first`}
      footer={
        <>
          <Button size="sm" variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Stop {jobCount} {jobCount === 1 ? 'process' : 'processes'}
          </Button>
        </>
      }
      bodyClassName="p-0"
    >
      <p className="border-b border-line px-4 py-3 text-xs leading-relaxed text-muted">
        Only processes identified as development services are affected. System daemons and
        anything not matching a known dev process are left alone.
      </p>

      {supervised.length > 0 && (
        <p className="border-b border-line bg-sunken/60 px-4 py-2.5 text-meta leading-relaxed text-muted">
          Skipping {supervised.length} supervised{' '}
          {supervised.length === 1 ? 'service' : 'services'} (
          {supervised.map((s) => s.supervisor!.label).join(', ')}) — the service manager
          would relaunch {supervised.length === 1 ? 'it' : 'them'} immediately.
        </p>
      )}

      {supervisedByParent > 0 && (
        <p className="border-b border-line bg-sunken/60 px-4 py-2.5 text-meta leading-relaxed text-muted">
          {supervisedByParent === 1 ? 'One of these is' : `${supervisedByParent} of these are`}{' '}
          held by a child of a parent process such as{' '}
          <span className="font-mono">npm run dev</span>. That parent is stopped too —
          otherwise it is left behind, and a watcher would rebind the port within seconds.
        </p>
      )}

      <ul className="divide-y divide-line">
        {devServices.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2">
            <span className="tnum w-12 shrink-0 font-mono text-xs font-semibold text-ink">
              {s.port}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink">
              {s.projectName || s.processName}
            </span>
            <FrameworkTag framework={s.framework} />
            <span className="tnum shrink-0 font-mono text-meta text-faint">PID {s.pid}</span>
            <span className="tnum w-16 shrink-0 text-right font-mono text-meta text-muted">
              {formatBytes(s.memoryBytes)}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
};
