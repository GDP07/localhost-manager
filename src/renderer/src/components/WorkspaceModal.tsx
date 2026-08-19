import React, { useState } from 'react';
import { FolderOpen, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Workspace, WorkspaceCommand } from '../../../shared/types/workspace';
import { Button, Field, IconButton, Input, Modal } from '../ui';
import { useToast } from './ToastContainer';

interface WorkspaceModalProps {
  initialWorkspace?: Workspace | null;
  onClose: () => void;
  onSave: (workspace: Partial<Workspace> & { name: string; directory: string }) => void;
}

const newCommand = (index: number): WorkspaceCommand => ({
  id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: `Service ${index + 1}`,
  command: '',
  status: 'idle'
});

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  initialWorkspace,
  onClose,
  onSave
}) => {
  const { showToast } = useToast();
  const [name, setName] = useState(initialWorkspace?.name || '');
  const [directory, setDirectory] = useState(initialWorkspace?.directory || '');
  const [url, setUrl] = useState(initialWorkspace?.url || '');
  const [commands, setCommands] = useState<WorkspaceCommand[]>(
    initialWorkspace?.commands?.length
      ? initialWorkspace.commands
      : [{ ...newCommand(0), name: 'Dev server', command: 'npm run dev', expectedPort: 3000 }]
  );

  const handleSelectDirectory = async () => {
    const selected = await window.localhostManagerAPI?.selectDirectory();
    if (!selected) return;
    setDirectory(selected);
    // Seed the name from the folder, since that is almost always what you want.
    if (!name.trim()) setName(selected.split('/').filter(Boolean).pop() || '');
  };

  const patchCommand = (id: string, updates: Partial<WorkspaceCommand>) =>
    setCommands((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));

  const handleSubmit = () => {
    if (!name.trim()) return showToast('Give the workspace a name', 'error');
    if (!directory.trim()) return showToast('Choose a project directory', 'error');

    const filled = commands.filter((c) => c.command.trim());
    if (filled.length === 0) return showToast('Add at least one command to run', 'error');

    onSave({
      id: initialWorkspace?.id,
      name: name.trim(),
      directory: directory.trim(),
      url: url.trim() || undefined,
      commands: filled
    });
    onClose();
  };

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={initialWorkspace ? 'Edit workspace' : 'New workspace'}
      subtitle="Commands run from the project directory and are stopped together"
      footer={
        <>
          <Button size="sm" variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={handleSubmit}>
            {initialWorkspace ? 'Save changes' : 'Create workspace'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Storefront"
            autoFocus
          />
        </Field>

        <Field label="Project directory" required>
          <div className="flex items-center gap-1.5">
            <Input
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="~/code/storefront"
              className="font-mono"
            />
            <Button size="md" onClick={handleSelectDirectory} className="shrink-0">
              <FolderOpen className="h-3.5 w-3.5" />
              Browse
            </Button>
          </div>
        </Field>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-ink">Commands</span>
              <span className="text-meta text-danger">required</span>
            </span>
            <button
              type="button"
              onClick={() => setCommands((prev) => [...prev, newCommand(prev.length)])}
              className="flex items-center gap-1 rounded text-meta font-medium text-accent transition-colors hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add command
            </button>
          </div>

          <div className="space-y-1.5">
            {commands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-start gap-1.5 rounded border border-line bg-sunken/60 p-1.5"
              >
                <GripVertical className="mt-2 h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={cmd.name}
                      onChange={(e) => patchCommand(cmd.id, { name: e.target.value })}
                      placeholder="Label"
                      aria-label="Command label"
                      className="h-7 flex-1"
                    />
                    <Input
                      type="number"
                      value={cmd.expectedPort ?? ''}
                      onChange={(e) =>
                        patchCommand(cmd.id, {
                          expectedPort: e.target.value ? parseInt(e.target.value, 10) : undefined
                        })
                      }
                      placeholder="Port"
                      aria-label="Expected port"
                      title="Checked for conflicts before the workspace starts"
                      className="tnum h-7 w-20 shrink-0 font-mono"
                    />
                  </div>
                  <Input
                    value={cmd.command}
                    onChange={(e) => patchCommand(cmd.id, { command: e.target.value })}
                    placeholder="npm run dev"
                    aria-label="Shell command"
                    className="h-7 font-mono"
                  />
                </div>

                <IconButton
                  label="Remove command"
                  size="sm"
                  disabled={commands.length === 1}
                  className="mt-0.5 hover:text-danger"
                  onClick={() => setCommands((prev) => prev.filter((c) => c.id !== cmd.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        </div>

        <Field
          label="Browser URL"
          hint="Optional. Opened by the workspace's open-in-browser action."
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000"
            className="font-mono"
          />
        </Field>
      </div>
    </Modal>
  );
};
