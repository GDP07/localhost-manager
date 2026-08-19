import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Square } from 'lucide-react';
import { ProcessTreeNode } from '../../../shared/types/service';
import { formatBytes, formatCpu } from '../utils/formatters';
import { cn } from '../utils/cn';
import { Badge, Button, IconButton, Modal } from '../ui';
import { useToast } from './ToastContainer';

interface ProcessTreeModalProps {
  pid: number;
  onClose: () => void;
  onStop: (pid: number, force?: boolean) => void;
  onStopTree: (pid: number, force?: boolean) => void;
}

function countNodes(node: ProcessTreeNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

export const ProcessTreeModal: React.FC<ProcessTreeModalProps> = ({
  pid,
  onClose,
  onStop,
  onStopTree
}) => {
  const { showToast } = useToast();
  const [tree, setTree] = useState<ProcessTreeNode | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTree = useCallback(async () => {
    if (!window.localhostManagerAPI) return;
    setLoading(true);
    try {
      setTree(await window.localhostManagerAPI.getProcessTree(pid));
    } catch (err) {
      console.error('Failed to get process tree:', err);
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const renderNode = (node: ProcessTreeNode, depth: number): React.ReactNode => (
    <li key={node.pid}>
      <div
        className={cn(
          'group flex items-center gap-3 rounded px-2 py-1.5 transition-colors hover:bg-sunken',
          node.pid === pid && 'bg-accent/[0.07]'
        )}
        // Indentation alone carries the hierarchy — depth here is rarely beyond 3.
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-xs text-ink">{node.name}</span>
            <span className="tnum shrink-0 font-mono text-meta text-faint">{node.pid}</span>
            {node.pid === pid && <Badge tone="accent">target</Badge>}
          </div>
          <div className="selectable truncate font-mono text-meta text-faint" title={node.commandLine}>
            {node.commandLine}
          </div>
        </div>

        <div className="tnum flex shrink-0 items-center gap-3 font-mono text-meta text-muted">
          <span className="w-12 text-right">{formatCpu(node.cpu)}</span>
          <span className="w-16 text-right">{formatBytes(node.memoryBytes)}</span>
        </div>

        <IconButton
          label={`Stop PID ${node.pid}`}
          size="sm"
          className="text-danger hover:bg-danger/10 hover:text-danger"
          onClick={async () => {
            await onStop(node.pid, false);
            showToast(`Stopped PID ${node.pid}`, 'success');
            fetchTree();
          }}
        >
          <Square className="h-3 w-3 fill-current" />
        </IconButton>
      </div>

      {node.children.length > 0 && (
        <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
      )}
    </li>
  );

  const total = tree ? countNodes(tree) : 0;

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title="Process tree"
      subtitle={
        loading
          ? `Reading hierarchy for PID ${pid}…`
          : tree
            ? `${total} ${total === 1 ? 'process' : 'processes'} rooted at PID ${pid}`
            : `PID ${pid} is no longer running`
      }
      actions={
        <IconButton label="Reload tree" size="sm" disabled={loading} onClick={fetchTree}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </IconButton>
      }
      footer={
        <>
          <span className="text-meta text-muted">
            Stopping the tree signals children before parents, so no workers are left behind.
          </span>
          <Button
            size="sm"
            variant="danger"
            disabled={!tree}
            onClick={() => {
              onStopTree(pid, false);
              onClose();
            }}
          >
            Stop all {total > 0 && `(${total})`}
          </Button>
        </>
      }
      bodyClassName="p-2"
    >
      {loading ? (
        <p className="px-2 py-10 text-center text-xs text-faint">Reading process hierarchy…</p>
      ) : tree ? (
        <ul>{renderNode(tree, 0)}</ul>
      ) : (
        <p className="px-2 py-10 text-center text-xs text-faint">
          PID {pid} is no longer running, or could not be inspected.
        </p>
      )}
    </Modal>
  );
};
