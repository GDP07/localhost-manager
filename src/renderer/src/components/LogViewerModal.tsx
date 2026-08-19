import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Copy, Search, Trash2 } from 'lucide-react';
import { WorkspaceExecutionLog } from '../../../shared/types/workspace';
import { formatTimestamp } from '../utils/formatters';
import { cn } from '../utils/cn';
import { IconButton, Input, Modal, Select } from '../ui';
import { useToast } from './ToastContainer';

interface LogViewerModalProps {
  workspaceName: string;
  workspaceId: string;
  logs: WorkspaceExecutionLog[];
  onClose: () => void;
  onClearLogs: (workspaceId: string) => void;
}

/** stderr is not automatically an error; many dev servers log progress there. */
const LINE_TONE: Record<WorkspaceExecutionLog['type'], string> = {
  stdout: 'text-ink',
  stderr: 'text-warn',
  system: 'text-accent'
};

export const LogViewerModal: React.FC<LogViewerModalProps> = ({
  workspaceName,
  workspaceId,
  logs,
  onClose,
  onClearLogs
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [commandFilter, setCommandFilter] = useState('all');
  const [pinned, setPinned] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const commandNames = Array.from(new Set(logs.map((l) => l.commandName).filter(Boolean)));

  const filtered = logs.filter((log) => {
    if (commandFilter !== 'all' && log.commandName !== commandFilter) return false;
    if (search.trim()) return log.message.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  // Stick to the bottom before paint, so new lines never show a scroll jump.
  useLayoutEffect(() => {
    if (pinned && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, pinned]);

  // Scrolling up unpins; returning to the bottom re-pins. No toggle to remember.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      setPinned(atBottom);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleCopy = () => {
    const text = filtered
      .map((l) => `${formatTimestamp(l.timestamp)} [${l.commandName || 'process'}] ${l.message}`)
      .join('\n');
    window.localhostManagerAPI?.copyToClipboard(text);
    showToast(`Copied ${filtered.length} ${filtered.length === 1 ? 'line' : 'lines'}`, 'success');
  };

  return (
    <Modal
      size="xl"
      tall
      onClose={onClose}
      title={workspaceName}
      subtitle={`${logs.length} ${logs.length === 1 ? 'line' : 'lines'} of stdout and stderr`}
      actions={
        <>
          <IconButton label="Copy visible lines" size="sm" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Clear log buffer"
            size="sm"
            onClick={() => onClearLogs(workspaceId)}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </>
      }
      bodyClassName="relative flex min-h-0 flex-col p-0"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find in output"
            aria-label="Find in output"
            className="h-7 pl-8 font-mono"
          />
        </div>

        {commandNames.length > 1 && (
          <Select
            value={commandFilter}
            onChange={(e) => setCommandFilter(e.target.value)}
            aria-label="Filter by command"
            className="h-7 w-auto"
          >
            <option value="all">All commands</option>
            {commandNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        )}

        <div className="flex-1" />

        <span className="tnum text-meta text-faint">
          {filtered.length === logs.length
            ? `${filtered.length} lines`
            : `${filtered.length} of ${logs.length}`}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="scroll-thin selectable min-h-0 flex-1 overflow-y-auto bg-sunken px-3 py-2 font-mono text-meta leading-[1.6]"
      >
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-faint">
            {logs.length === 0
              ? 'No output yet. Start the workspace to stream its logs here.'
              : `Nothing matches “${search}”.`}
          </p>
        ) : (
          filtered.map((log) => (
            <div key={log.id} className="flex gap-2.5">
              <span className="tnum shrink-0 select-none text-faint">
                {formatTimestamp(log.timestamp)}
              </span>
              <span className="w-20 shrink-0 select-none truncate text-faint">
                {log.commandName || 'process'}
              </span>
              <span className={cn('min-w-0 flex-1 whitespace-pre-wrap break-all', LINE_TONE[log.type])}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Appears only when detached from the tail, which is the only time it is useful. */}
      {!pinned && (
        <button
          type="button"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-meta text-ink shadow-pop"
        >
          <ArrowDownToLine className="h-3 w-3" />
          Jump to latest
        </button>
      )}
    </Modal>
  );
};
