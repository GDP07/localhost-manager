import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { AppConfig, DEFAULT_CONFIG } from '../../../shared/types/config';
import { Theme } from '../hooks/useTheme';
import { Button, Field, Input, Modal, Select, Toggle } from '../ui';
import { useToast } from './ToastContainer';

interface SettingsModalProps {
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-b border-line px-4 py-4 last:border-0">
    <h3 className="mb-3 text-meta font-medium uppercase tracking-wide text-faint">{title}</h3>
    <div className="space-y-3.5">{children}</div>
  </section>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onThemeChange }) => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    window.localhostManagerAPI?.getAppConfig().then(setConfig);
  }, []);

  const patch = (updates: Partial<AppConfig>) => setConfig((prev) => ({ ...prev, ...updates }));

  const addKeyword = () => {
    const value = keyword.trim().toLowerCase();
    if (!value) return;
    if (config.customDevProcessNames.includes(value)) {
      showToast(`"${value}" is already tracked`, 'error');
      return;
    }
    patch({ customDevProcessNames: [...config.customDevProcessNames, value] });
    setKeyword('');
  };

  const handleSave = async () => {
    await window.localhostManagerAPI?.updateAppConfig(config);
    // Theme is owned by useTheme so the class and localStorage mirror stay in step.
    onThemeChange(config.theme);
    showToast('Settings saved', 'success');
    onClose();
  };

  return (
    <Modal
      onClose={onClose}
      title="Settings"
      subtitle="Stored in ~/.localhost-manager/config.json"
      bodyClassName="p-0"
      footer={
        <>
          <Button size="sm" variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <Section title="Appearance">
        <Field label="Theme">
          <Select
            value={config.theme}
            onChange={(e) => patch({ theme: e.target.value as Theme })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Match system</option>
          </Select>
        </Field>
      </Section>

      <Section title="Monitoring">
        <Field
          label="Port scan interval"
          hint="Applies immediately after saving. Longer intervals use less CPU on battery."
        >
          <Select
            value={config.refreshIntervalMs}
            onChange={(e) => patch({ refreshIntervalMs: parseInt(e.target.value, 10) })}
          >
            <option value={2000}>Every 2 seconds</option>
            <option value={3000}>Every 3 seconds</option>
            <option value={5000}>Every 5 seconds</option>
            <option value={10000}>Every 10 seconds</option>
          </Select>
        </Field>

        <Field
          label="Terminal application"
          hint="Leave empty to auto-detect. Falls back to the system default terminal."
        >
          <Input
            value={config.terminalEmulator || ''}
            onChange={(e) => patch({ terminalEmulator: e.target.value || undefined })}
            placeholder="Warp, iTerm, Alacritty, Windows Terminal…"
            className="font-mono"
          />
        </Field>
      </Section>

      <Section title="Window">
        <Toggle
          label="Show tray icon"
          hint="Lists active dev ports in the menu bar."
          checked={config.enableTray}
          onChange={(enableTray) => patch({ enableTray })}
        />
        <Toggle
          label="Closing the window keeps it running"
          hint="Keeps monitoring in the background instead of quitting."
          checked={config.closeToTray}
          onChange={(closeToTray) => patch({ closeToTray })}
        />
      </Section>

      <Section title="Development process detection">
        <p className="text-meta leading-relaxed text-muted">
          A listening process is treated as a development service when its name or command
          contains one of these keywords, or when a project directory was detected.
        </p>

        <div className="flex items-center gap-1.5">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
              }
            }}
            placeholder="Add a keyword, e.g. deno"
            className="font-mono"
          />
          <Button size="md" onClick={addKeyword} className="shrink-0">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        <div className="scroll-thin flex max-h-36 flex-wrap gap-1 overflow-y-auto rounded border border-line bg-sunken p-2">
          {config.customDevProcessNames.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-0.5 rounded border border-line bg-surface py-px pl-1.5 pr-0.5 font-mono text-meta text-ink"
            >
              {name}
              <button
                type="button"
                onClick={() =>
                  patch({
                    customDevProcessNames: config.customDevProcessNames.filter((n) => n !== name)
                  })
                }
                aria-label={`Remove ${name}`}
                className="rounded p-0.5 text-faint transition-colors hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </Section>
    </Modal>
  );
};
