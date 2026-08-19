import { useState, useEffect, useCallback } from 'react';
import { Workspace, WorkspaceExecutionLog } from '../../../shared/types/workspace';
import { PortConflict } from '../../../shared/types/service';

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLogs, setActiveLogs] = useState<WorkspaceExecutionLog[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    try {
      if (window.localhostManagerAPI) {
        const data = await window.localhostManagerAPI.getWorkspaces();
        setWorkspaces(data);
      }
    } catch (err) {
      console.error('Failed to get workspaces:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();

    if (window.localhostManagerAPI) {
      const unsubUpdate = window.localhostManagerAPI.onWorkspaceUpdated((updated: Workspace) => {
        setWorkspaces((prev) => {
          const index = prev.findIndex((w) => w.id === updated.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = updated;
            return next;
          }
          return [...prev, updated];
        });
      });

      const unsubDelete = window.localhostManagerAPI.onWorkspaceDeleted((id: string) => {
        setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      });

      const unsubLog = window.localhostManagerAPI.onWorkspaceLog((log: WorkspaceExecutionLog) => {
        setActiveLogs((prev) => {
          if (prev.length > 1500) {
            return [...prev.slice(1), log];
          }
          return [...prev, log];
        });
      });

      return () => {
        unsubUpdate();
        unsubDelete();
        unsubLog();
      };
    }
  }, [fetchWorkspaces]);

  const saveWorkspace = async (workspace: Partial<Workspace> & { name: string; directory: string }) => {
    if (!window.localhostManagerAPI) return null;
    const res = await window.localhostManagerAPI.saveWorkspace(workspace);
    return res;
  };

  const deleteWorkspace = async (id: string) => {
    if (!window.localhostManagerAPI) return false;
    return window.localhostManagerAPI.deleteWorkspace(id);
  };

  const startWorkspace = async (id: string, bypassConflictCheck = false): Promise<{ success: boolean; error?: string; conflicts?: PortConflict[] }> => {
    if (!window.localhostManagerAPI) return { success: false, error: 'API unavailable' };
    return window.localhostManagerAPI.startWorkspace(id, bypassConflictCheck);
  };

  const stopWorkspace = async (id: string) => {
    if (!window.localhostManagerAPI) return { success: false, error: 'API unavailable' };
    return window.localhostManagerAPI.stopWorkspace(id);
  };

  const restartWorkspace = async (id: string) => {
    if (!window.localhostManagerAPI) return { success: false, error: 'API unavailable' };
    return window.localhostManagerAPI.restartWorkspace(id);
  };

  const loadLogs = async (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    if (window.localhostManagerAPI) {
      const logs = await window.localhostManagerAPI.getWorkspaceLogs(workspaceId);
      setActiveLogs(logs);
    }
  };

  const clearLogs = async (workspaceId: string) => {
    if (window.localhostManagerAPI) {
      await window.localhostManagerAPI.clearWorkspaceLogs(workspaceId);
      setActiveLogs([]);
    }
  };

  return {
    workspaces,
    loading,
    activeLogs,
    activeWorkspaceId,
    setActiveWorkspaceId,
    saveWorkspace,
    deleteWorkspace,
    startWorkspace,
    stopWorkspace,
    restartWorkspace,
    loadLogs,
    clearLogs
  };
}
