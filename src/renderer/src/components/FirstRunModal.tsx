import React, { useEffect, useState } from 'react';
import { FirstRunSummary } from '../../../shared/types/ipc';
import { Button, Kbd } from '../ui';

interface FirstRunModalProps {
  onDismiss: () => void;
}

/**
 * Shown once. It reports what the first scan actually found rather than narrating
 * progress — a welcome screen that claims work it did not do is just noise.
 */
export const FirstRunModal: React.FC<FirstRunModalProps> = ({ onDismiss }) => {
  const [summary, setSummary] = useState<FirstRunSummary | null>(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let cancelled = false;

    window.localhostManagerAPI
      ?.getFirstRunSummary()
      .then((res) => !cancelled && setSummary(res))
      .catch(() => !cancelled && setSummary(null))
      .finally(() => !cancelled && setScanning(false));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[55] flex animate-fade-in items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md animate-panel-in">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Localhost Manager</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Every port listening on this machine, what started it, and which project it belongs
          to. Nothing leaves your computer.
        </p>

        <div className="my-5 rounded-lg border border-line bg-surface">
          {scanning ? (
            <p className="px-4 py-6 text-center text-xs text-faint">Scanning ports…</p>
          ) : summary ? (
            <dl className="grid grid-cols-3 divide-x divide-line">
              {[
                { label: 'Ports', value: summary.portsCount },
                { label: 'Projects', value: summary.projectsCount },
                { label: 'Workspaces', value: summary.devEnvironmentsCount }
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-3 text-center">
                  <dd className="tnum font-mono text-base font-semibold text-ink">{stat.value}</dd>
                  <dt className="mt-0.5 text-meta uppercase tracking-wide text-faint">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-faint">
              The first scan could not complete. The list will fill in as ports are found.
            </p>
          )}
        </div>

        <p className="mb-4 flex items-center gap-1.5 text-meta text-muted">
          Press <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> at any time to jump to a port or run an action.
        </p>

        <Button variant="primary" size="md" onClick={onDismiss} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  );
};
