export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  // Bytes and KB are never fractional in practice; MB upward reads better with one place.
  const dm = i < 2 ? 0 : Math.max(decimals, 0);
  return `${(bytes / Math.pow(k, i)).toFixed(dm)} ${sizes[i]}`;
}

export function formatCpu(cpu: number): string {
  if (typeof cpu !== 'number' || Number.isNaN(cpu)) return '0%';
  return `${cpu.toFixed(cpu < 10 ? 1 : 0)}%`;
}

/**
 * Collapse the user's home directory to `~`. The home path comes from the main process
 * via preload — deriving it from window.location never worked, since that is the
 * renderer's own document URL, not a filesystem location.
 */
export function formatPath(fullPath: string | null): string {
  if (!fullPath) return 'Unknown';
  const home = window.localhostManagerAPI?.homeDir;
  if (home && fullPath.startsWith(home)) {
    return `~${fullPath.slice(home.length)}`;
  }
  return fullPath;
}

/** Keep the trailing segments that identify a directory when space is tight. */
export function truncatePath(fullPath: string | null, segments = 2): string {
  const shortened = formatPath(fullPath);
  if (shortened === 'Unknown') return shortened;
  const parts = shortened.split('/').filter(Boolean);
  if (parts.length <= segments) return shortened;
  return `…/${parts.slice(-segments).join('/')}`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}
