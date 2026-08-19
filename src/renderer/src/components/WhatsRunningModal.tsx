import React from 'react';
import { Copy, ExternalLink, Radio } from 'lucide-react';
import { ServiceInfo } from '../../../shared/types/service';
import { formatBytes, truncatePath } from '../utils/formatters';
import { Button, EmptyState, FrameworkTag, IconButton, Modal, StatusDot } from '../ui';
import { useToast } from './ToastContainer';

interface WhatsRunningModalProps {
  services: ServiceInfo[];
  onClose: () => void;
}

/**
 * The answer to "what have I got running?" in a form that can be pasted into a
 * message to a colleague — which is the reason this view exists separately.
 */
export const WhatsRunningModal: React.FC<WhatsRunningModalProps> = ({ services, onClose }) => {
  const { showToast } = useToast();
  const api = window.localhostManagerAPI;
  const devServices = services.filter((s) => s.isDevProcess);

  const handleCopySummary = () => {
    const text = devServices
      .map((s) =>
        [
          s.url,
          s.projectName || s.processName,
          s.framework?.name,
          `PID ${s.pid}`,
          formatBytes(s.memoryBytes)
        ]
          .filter(Boolean)
          .join('  ·  ')
      )
      .join('\n');

    api?.copyToClipboard(text || 'No development services running.');
    showToast('Summary copied', 'success');
  };

  return (
    <Modal
      onClose={onClose}
      title="What's running"
      subtitle={`${devServices.length} development ${devServices.length === 1 ? 'service' : 'services'} of ${services.length} listening ${services.length === 1 ? 'port' : 'ports'}`}
      actions={
        <IconButton label="Copy as text" size="sm" onClick={handleCopySummary}>
          <Copy className="h-4 w-4" />
        </IconButton>
      }
      footer={
        <>
          <span className="text-meta text-muted">
            Copy produces one line per service, ready to paste.
          </span>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
      bodyClassName="p-2"
    >
      {devServices.length === 0 ? (
        <EmptyState
          icon={<Radio className="h-4 w-4" />}
          title="Nothing running"
          body="No local development servers are listening right now."
        />
      ) : (
        <ul className="divide-y divide-line">
          {devServices.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-2 py-2">
              <StatusDot health={s.health} />
              <span className="tnum w-12 shrink-0 font-mono text-xs font-semibold text-ink">
                {s.port}
              </span>

              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-ink">
                  {s.projectName || s.processName}
                </div>
                {s.projectPath && (
                  <div className="truncate font-mono text-meta text-faint" title={s.projectPath}>
                    {truncatePath(s.projectPath, 2)}
                  </div>
                )}
              </div>

              <FrameworkTag framework={s.framework} />
              <span className="tnum w-16 shrink-0 text-right font-mono text-meta text-muted">
                {formatBytes(s.memoryBytes)}
              </span>
              <IconButton
                label={`Open ${s.url}`}
                size="sm"
                onClick={() => api?.openInBrowser(s.url)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
