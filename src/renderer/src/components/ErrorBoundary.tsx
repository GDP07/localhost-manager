import React from 'react';
import { Button, CodeBlock } from '../ui';

interface State {
  error: Error | null;
}

/**
 * Without this, one bad render blanks the window with no way back — the worst
 * possible failure mode for a monitoring tool. Reload restarts the renderer only;
 * the main process keeps polling throughout.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Renderer crashed:', error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-lg">
          <h1 className="text-sm font-semibold text-ink">The window stopped rendering</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Port monitoring is still running in the background. Reloading rebuilds the
            interface without restarting the app.
          </p>

          <CodeBlock wrap className="mt-3">
            {error.message || String(error)}
          </CodeBlock>

          <div className="mt-4 flex items-center gap-2">
            <Button variant="primary" size="md" onClick={() => window.location.reload()}>
              Reload window
            </Button>
            <Button
              size="md"
              onClick={() => {
                window.localhostManagerAPI?.copyToClipboard(
                  `${error.message}\n\n${error.stack ?? '(no stack)'}`
                );
              }}
            >
              Copy details
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
