import { useCallback, useEffect, useMemo, useState } from 'react';
import { HealthStatus, ServiceInfo } from '../../../shared/types/service';
import { StopAllDevResult } from '../../../shared/types/ipc';
import { ViewMode } from '../components/FilterBar';

/**
 * Category matchers, one predicate each. Keeping them in a table rather than an
 * if/else ladder means adding a language is a single line, and FilterBar's ids and
 * these keys are the only two places that need to agree.
 */
const CATEGORY_MATCHERS: Record<string, (s: ServiceInfo, haystack: string) => boolean> = {
  node: (_s, h) => /node|next|vite|react|vue|nuxt|express|nest|svelte|astro|remix|bun|deno/.test(h),
  python: (_s, h) => /python|uvicorn|gunicorn|fastapi|django|flask/.test(h),
  php: (_s, h) => /php|laravel|symfony|artisan|wordpress/.test(h),
  rust: (_s, h) => /rust|cargo/.test(h),
  go: (_s, h) => /\bgo\b|golang/.test(h),
  database: (s, h) =>
    s.framework?.category === 'database' || /postgres|redis|mongo|mysql|mariadb/.test(h),
  orphans: (s) => s.isOrphan
};

export function useServices() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  const refresh = useCallback(async () => {
    if (!window.localhostManagerAPI) return;
    setLoading(true);
    try {
      setServices(await window.localhostManagerAPI.refreshServices());
    } catch (err) {
      console.error('Failed to refresh services:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const api = window.localhostManagerAPI;
    if (!api) {
      setLoading(false);
      return;
    }

    api
      .getServices()
      .then(setServices)
      .catch((err) => console.error('Failed to get services:', err))
      .finally(() => setLoading(false));

    // The main process polls; the renderer only listens.
    return api.onServicesUpdated((updated) => {
      setServices(updated);
      setLoading(false);
    });
  }, []);

  /** Drop rows for a stopped pid immediately, rather than waiting for the next poll. */
  const forget = useCallback((pids: number[]) => {
    const gone = new Set(pids);
    setServices((prev) => prev.filter((s) => !gone.has(s.pid)));
  }, []);

  const stopProcess = useCallback(
    async (pid: number, force = false) => {
      if (!window.localhostManagerAPI) return { success: false };
      const res = await window.localhostManagerAPI.stopProcess(pid, force);
      if (res.success) forget([pid]);
      return res;
    },
    [forget]
  );

  const stopProcessTree = useCallback(
    async (pid: number, force = false) => {
      if (!window.localhostManagerAPI) return { success: false };
      const res = await window.localhostManagerAPI.stopProcessTree(pid, force);
      if (res.success) forget([pid]);
      return res;
    },
    [forget]
  );

  const stopAllDev = useCallback(async (): Promise<StopAllDevResult> => {
    if (!window.localhostManagerAPI) {
      return { stoppedCount: 0, failedCount: 0, stoppedPids: [] };
    }
    const result = await window.localhostManagerAPI.stopAllDevProcesses();
    forget(result.stoppedPids);
    return result;
  }, [forget]);

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return services.filter((service) => {
      // One haystack per service, reused by both search and category matching.
      const haystack = [
        service.port,
        service.pid,
        service.processName,
        service.projectName,
        service.projectPath,
        service.framework?.name,
        service.commandLine,
        service.url
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (categoryFilter !== 'all') {
        const match = CATEGORY_MATCHERS[categoryFilter];
        if (match && !match(service, haystack)) return false;
      }

      if (healthFilter !== 'all' && service.health !== (healthFilter as HealthStatus)) {
        return false;
      }

      return true;
    });
  }, [services, searchQuery, categoryFilter, healthFilter]);

  const groupedByProject = useMemo(() => {
    const groups = new Map<string, ServiceInfo[]>();
    for (const service of filteredServices) {
      const key = service.projectName || 'Unidentified';
      const list = groups.get(key);
      if (list) list.push(service);
      else groups.set(key, [service]);
    }

    return Array.from(groups, ([projectName, items]) => ({
      projectName,
      projectPath: items.find((s) => s.projectPath)?.projectPath ?? null,
      services: items
    }));
  }, [filteredServices]);

  const stats = useMemo(() => {
    const devServices = services.filter((s) => s.isDevProcess);
    // A process can hold several ports; memory must not be counted once per port.
    const seen = new Set<number>();
    let totalMemoryBytes = 0;
    for (const service of devServices) {
      if (seen.has(service.pid)) continue;
      seen.add(service.pid);
      totalMemoryBytes += service.memoryBytes;
    }

    return {
      totalPorts: services.length,
      devServicesCount: devServices.length,
      projectsCount: new Set(devServices.map((s) => s.projectName).filter(Boolean)).size,
      totalMemoryBytes,
      orphanCount: services.filter((s) => s.isOrphan).length
    };
  }, [services]);

  return {
    services: filteredServices,
    allServices: services,
    groupedByProject,
    stats,
    loading,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    healthFilter,
    setHealthFilter,
    viewMode,
    setViewMode,
    refresh,
    stopProcess,
    stopProcessTree,
    stopAllDev
  };
}
