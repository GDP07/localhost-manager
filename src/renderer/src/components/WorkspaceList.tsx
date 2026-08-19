import React from 'react';
import {
  ExternalLink,
  FolderOpen,
  Layers,
  Pencil,
  Play,
  RotateCw,
  ScrollText,
  Square,
  Terminal
} from 'lucide-react';
import { Workspace, WorkspaceCommand } from '../../../shared/types/workspace';
import { truncatePath } from '../utils/formatters';
import { cn } from '../utils/cn';
import { Badge, Button, EmptyState, IconButton, Menu } from '../ui';

interface WorkspaceListProps {
  workspaces: Workspace[];
  onStartWorkspace: (id: string) => void;
  onStopWorkspace: (id: string) => void;
  onRestartWorkspace: (id: string) => void;
  onViewLogs: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace: (workspace: Workspace) => void;
}

const STATUS: Record<Workspace['status'], { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }> = {
  running: { label: 'Running', tone: 'ok' },
  starting: { label: 'Starting', tone: 'warn' },
  failed: { label: 'Failed', tone: 'danger' },
  stopped: { label: 'Stopped', tone: 'neutral' }
};

const COMMAND_DOT: Record<WorkspaceCommand['status'], string> = {
  running: 'bg-ok',
  starting: 'bg-warn',
  failed: 'bg-danger',
  stopped: 'bg-faint',
  idle: 'border border-line-strong'
};

export const WorkspaceList: React.FC<WorkspaceListProps> = ({
  workspaces,
  onStartWorkspace,
  onStopWorkspace,
  onRestartWorkspace,
  onViewLogs,
  onCreateWorkspace,
  onEditWorkspace,
  onDeleteWorkspace
}) => {
  const api = window.localhostManagerAPI;

  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={<Layers className="h-4 w-4" />}
        title="No workspaces yet"
        body="A workspace groups the commands a project needs — dev server, worker, database — so they start and stop together."
      >
        <Button variant="primary" size="md" onClick={onCreateWorkspace}>
          New workspace
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-meta text-muted">
          {workspaces.length} {workspaces.length === 1 ? 'workspace' : 'workspaces'}
        </p>
        <Button size="sm" variant="primary" onClick={onCreateWorkspace}>
          New workspace
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {workspaces.map((ws) => {
          const isRunning = ws.status === 'running';
          const isStarting = ws.status === 'starting';

          return (
            <article
              key={ws.id}
              className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong"
            >
              <div className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-xs font-semibold text-ink">{ws.name}</h3>
                    <Badge tone={STATUS[ws.status].tone}>{STATUS[ws.status].label}</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => api?.showItemInFolder(ws.directory)}
                    title={ws.directory}
                    className="mt-0.5 flex max-w-full items-center gap-1 rounded font-mono text-meta text-faint transition-colors hover:text-ink"
                  >
                    <FolderOpen className="h-3 w-3 shrink-0" />
                    <span className="truncate">{truncatePath(ws.directory, 2)}</span>
                  </button>
                </div>

                <Menu
                  items={[
                    { label: 'Edit workspace', onSelect: () => onEditWorkspace(ws) },
                    { label: 'Open terminal here', onSelect: () => api?.openInTerminal(ws.directory) },
                    { label: 'Delete workspace', tone: 'danger', onSelect: () => onDeleteWorkspace(ws) }
                  ]}
                  trigger={({ toggle }) => (
                    <IconButton label="Workspace options" size="sm" onClick={toggle}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                  )}
                />
              </div>

              <ul className="space-y-1 px-3 pb-3">
                {ws.commands.map((cmd) => (
                  <li
                    key={cmd.id}
                    className="flex items-center gap-2 rounded border border-line bg-sunken/60 px-2 py-1.5"
                  >
                    <span
                      title={cmd.status}
                      className={cn('h-2 w-2 shrink-0 rounded-full', COMMAND_DOT[cmd.status])}
                    />
                    <span className="w-24 shrink-0 truncate text-meta font-medium text-ink">
                      {cmd.name}
                    </span>
                    <code
                      className="selectable min-w-0 flex-1 truncate font-mono text-meta text-muted"
                      title={cmd.command}
                    >
                      {cmd.command}
                    </code>
                    {cmd.expectedPort && (
                      <span className="tnum shrink-0 font-mono text-meta text-faint">
                        :{cmd.expectedPort}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex items-center gap-1 border-t border-line px-2 py-2">
                <Button size="sm" variant="subtle" onClick={() => onViewLogs(ws)}>
                  <ScrollText className="h-3.5 w-3.5" />
                  Logs
                </Button>
                <IconButton
                  label="Open terminal in workspace directory"
                  size="sm"
                  onClick={() => api?.openInTerminal(ws.directory)}
                >
                  <Terminal className="h-3.5 w-3.5" />
                </IconButton>
                {ws.url && (
                  <IconButton
                    label={`Open ${ws.url}`}
                    size="sm"
                    onClick={() => api?.openInBrowser(ws.url!)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </IconButton>
                )}

                <div className="flex-1" />

                {isRunning ? (
                  <>
                    <IconButton
                      label="Restart workspace"
                      size="sm"
                      onClick={() => onRestartWorkspace(ws.id)}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </IconButton>
                    <Button
                      size="sm"
                      variant="danger-quiet"
                      onClick={() => onStopWorkspace(ws.id)}
                    >
                      <Square className="h-3 w-3 fill-current" />
                      Stop
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isStarting}
                    onClick={() => onStartWorkspace(ws.id)}
                  >
                    <Play className="h-3 w-3 fill-current" />
                    {isStarting ? 'Starting…' : 'Start'}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
