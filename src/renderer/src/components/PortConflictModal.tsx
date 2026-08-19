import React from 'react';
import { PortConflict } from '../../../shared/types/service';
import { Button, CodeBlock, Modal } from '../ui';

interface PortConflictModalProps {
  conflicts: PortConflict[];
  workspaceName: string;
  onClose: () => void;
  onStopAndStart: () => void;
  onStartAnyway: () => void;
}

export const PortConflictModal: React.FC<PortConflictModalProps> = ({
  conflicts,
  workspaceName,
  onClose,
  onStopAndStart,
  onStartAnyway
}) => (
  <Modal
    onClose={onClose}
    title={`${workspaceName} needs ${conflicts.length === 1 ? 'a port' : 'ports'} already in use`}
    subtitle="Starting anyway usually means the new process picks a different port, or fails"
    footer={
      <>
        <Button size="sm" variant="subtle" onClick={onClose}>
          Cancel
        </Button>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={onStartAnyway}>
            Start anyway
          </Button>
          <Button size="sm" variant="danger" onClick={onStopAndStart}>
            Stop {conflicts.length === 1 ? 'it' : 'them'} and start
          </Button>
        </div>
      </>
    }
  >
    <ul className="space-y-2">
      {conflicts.map((conflict) => (
        <li key={conflict.port} className="rounded-lg border border-line bg-sunken/60 p-3">
          <div className="flex items-baseline gap-2">
            <span className="tnum font-mono text-sm font-semibold text-warn">
              {conflict.port}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-ink">
              {conflict.projectName || conflict.processName}
            </span>
            <span className="tnum shrink-0 font-mono text-meta text-faint">
              PID {conflict.currentPid}
            </span>
          </div>
          {conflict.commandLine && (
            <CodeBlock className="mt-2" title={conflict.commandLine}>
              {conflict.commandLine}
            </CodeBlock>
          )}
        </li>
      ))}
    </ul>
  </Modal>
);
