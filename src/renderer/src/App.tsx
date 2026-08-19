import React, { useEffect, useState } from 'react';
import { FolderTree, Radio } from 'lucide-react';
import { ServiceInfo } from '../../shared/types/service';
import { PortConflict } from '../../shared/types/service';
import { Workspace } from '../../shared/types/workspace';
import { useServices } from './hooks/useServices';
import { useWorkspaces } from './hooks/useWorkspaces';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { truncatePath } from './utils/formatters';
import { Button, EmptyState, Modal } from './ui';
import { Header } from './components/Header';
import { StatsBar } from './components/StatsBar';
import { FilterBar } from './components/FilterBar';
import { ServiceCard } from './components/ServiceCard';
import { ServiceTable } from './components/ServiceTable';
import { WorkspaceList } from './components/WorkspaceList';
import { PortInspectorModal } from './components/PortInspectorModal';
import { ProcessTreeModal } from './components/ProcessTreeModal';
import { LogViewerModal } from './components/LogViewerModal';
import { WorkspaceModal } from './components/WorkspaceModal';
import { PortConflictModal } from './components/PortConflictModal';
import { WhatsRunningModal } from './components/WhatsRunningModal';
import { CommandPalette } from './components/CommandPalette';
import { StopAllConfirmModal } from './components/StopAllConfirmModal';
import { SettingsModal } from './components/SettingsModal';
import { FirstRunModal } from './components/FirstRunModal';
import { ToastProvider, useToast } from './components/ToastContainer';

const WELCOME_KEY = 'lm.welcomed';

const AppContent: React.FC = () => {
  const { showToast } = useToast();
  const { theme, resolved, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'services' | 'workspaces'>('services');

  const {
    services,
    allServices,
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
  } = useServices();

  const {
    workspaces,
    activeLogs,
    saveWorkspace,
    deleteWorkspace,
    startWorkspace,
    stopWorkspace,
    restartWorkspace,
    loadLogs,
    clearLogs
  } = useWorkspaces();

  const [inspecting, setInspecting] = useState<ServiceInfo | null>(null);
  const [treePid, setTreePid] = useState<number | null>(null);
  const [logsFor, setLogsFor] = useState<Workspace | null>(null);
  const [editing, setEditing] = useState<Workspace | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);
  const [conflict, setConflict] = useState<{ conflicts: PortConflict[]; workspace: Workspace } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showStopAll, setShowStopAll] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY));

  useKeyboardShortcuts({
    onCommandPalette: () => setShowPalette(true),
    onRefresh: refresh
  });

  // Report discovery failures once per distinct message; a failing scan repeats every
  // few seconds and must not become a wall of toasts.
  useEffect(() => {
    let last = '';
    return window.localhostManagerAPI?.onScanFailed((message) => {
      if (message === last) return;
      last = message;
      showToast(`Port discovery failed: ${message}`, 'error');
    });
  }, [showToast]);

  // The inspected service is a snapshot; keep it in step with each poll so metrics
  // in the open dialog do not go stale.
  useEffect(() => {
    if (!inspecting) return;
    const next = allServices.find((s) => s.id === inspecting.id);
    if (next && next !== inspecting) setInspecting(next);
  }, [allServices, inspecting]);

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_KEY, '1');
    setShowWelcome(false);
  };

  const handleStartWorkspace = async (id: string, bypass = false) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;

    const res = await startWorkspace(id, bypass);
    if (res.success) {
      showToast(`Started ${ws.name}`, 'success');
    } else if (res.conflicts?.length) {
      setConflict({ conflicts: res.conflicts, workspace: ws });
    } else {
      showToast(res.error || `Could not start ${ws.name}`, 'error');
    }
  };

  const handleResolveConflict = async () => {
    if (!conflict) return;
    const { workspace, conflicts } = conflict;
    setConflict(null);
    await Promise.all(conflicts.map((c) => stopProcessTree(c.currentPid, true)));
    // Give the OS a moment to release the sockets before rebinding them.
    await new Promise((r) => setTimeout(r, 600));
    await handleStartWorkspace(workspace.id, true);
  };

  const handleStopAll = async () => {
    const res = await stopAllDev();
    if (res.failedCount > 0) {
      showToast(
        `Stopped ${res.stoppedCount}; ${res.failedCount} could not be stopped`,
        'error'
      );
    } else {
      showToast(
        `Stopped ${res.stoppedCount} ${res.stoppedCount === 1 ? 'process' : 'processes'}`,
        'success'
      );
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!deleting) return;
    await deleteWorkspace(deleting.id);
    showToast(`Deleted ${deleting.name}`, 'success');
    setDeleting(null);
  };

  const filtersActive =
    Boolean(searchQuery.trim()) || categoryFilter !== 'all' || healthFilter !== 'all';

  const serviceCards = (list: ServiceInfo[]) => (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {list.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          onInspect={setInspecting}
          onViewTree={setTreePid}
          onStop={stopProcess}
          onStopTree={stopProcessTree}
        />
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefresh={refresh}
        loading={loading}
        onOpenCommandPalette={() => setShowPalette(true)}
        onOpenSettings={() => setShowSettings(true)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        resolvedTheme={resolved}
        onToggleTheme={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
        devCount={stats.devServicesCount}
        workspaceCount={workspaces.length}
      />

      {activeTab === 'services' ? (
        <>
          <StatsBar
            stats={stats}
            onFilterOrphans={() => setCategoryFilter('orphans')}
            onOpenSummary={() => setShowSummary(true)}
            onOpenStopAll={() => setShowStopAll(true)}
          />
          <FilterBar
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            healthFilter={healthFilter}
            onHealthChange={setHealthFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            totalVisible={services.length}
            totalServices={allServices.length}
          />

          <main className="scroll-thin flex-1 overflow-y-auto p-4">
            {services.length === 0 ? (
              filtersActive ? (
                <EmptyState
                  icon={<Radio className="h-4 w-4" />}
                  title="No matches"
                  body="No listening port matches the current filter."
                >
                  <Button
                    size="md"
                    onClick={() => {
                      setSearchQuery('');
                      setCategoryFilter('all');
                      setHealthFilter('all');
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyState>
              ) : (
                <EmptyState
                  icon={<Radio className="h-4 w-4" />}
                  title="Nothing is listening"
                  body="Start a development server and it will appear here within a few seconds."
                >
                  <Button size="md" onClick={refresh}>
                    Scan again
                  </Button>
                  <Button
                    size="md"
                    variant="primary"
                    onClick={() => {
                      setActiveTab('workspaces');
                      setEditing('new');
                    }}
                  >
                    New workspace
                  </Button>
                </EmptyState>
              )
            ) : viewMode === 'table' ? (
              <ServiceTable
                services={services}
                onInspect={setInspecting}
                onViewTree={setTreePid}
                onStopJob={stopProcessTree}
              />
            ) : viewMode === 'grouped' ? (
              <div className="space-y-5">
                {groupedByProject.map((group) => (
                  <section key={group.projectName}>
                    <header className="mb-2 flex items-baseline gap-2">
                      <FolderTree className="h-3.5 w-3.5 shrink-0 self-center text-faint" />
                      <h2 className="text-xs font-semibold text-ink">{group.projectName}</h2>
                      <span className="tnum text-meta text-faint">
                        {group.services.length}
                      </span>
                      {group.projectPath && (
                        <span
                          className="ml-auto truncate font-mono text-meta text-faint"
                          title={group.projectPath}
                        >
                          {truncatePath(group.projectPath, 3)}
                        </span>
                      )}
                    </header>
                    {serviceCards(group.services)}
                  </section>
                ))}
              </div>
            ) : (
              serviceCards(services)
            )}
          </main>
        </>
      ) : (
        <main className="scroll-thin flex-1 overflow-y-auto">
          <WorkspaceList
            workspaces={workspaces}
            onStartWorkspace={(id) => handleStartWorkspace(id)}
            onStopWorkspace={stopWorkspace}
            onRestartWorkspace={restartWorkspace}
            onViewLogs={(ws) => {
              loadLogs(ws.id);
              setLogsFor(ws);
            }}
            onCreateWorkspace={() => setEditing('new')}
            onEditWorkspace={setEditing}
            onDeleteWorkspace={setDeleting}
          />
        </main>
      )}

      {inspecting && (
        <PortInspectorModal
          service={inspecting}
          onClose={() => setInspecting(null)}
          onStop={stopProcess}
          onStopTree={stopProcessTree}
          onViewTree={setTreePid}
        />
      )}

      {treePid !== null && (
        <ProcessTreeModal
          pid={treePid}
          onClose={() => setTreePid(null)}
          onStop={stopProcess}
          onStopTree={stopProcessTree}
        />
      )}

      {logsFor && (
        <LogViewerModal
          workspaceName={logsFor.name}
          workspaceId={logsFor.id}
          logs={activeLogs}
          onClose={() => setLogsFor(null)}
          onClearLogs={clearLogs}
        />
      )}

      {editing !== null && (
        <WorkspaceModal
          initialWorkspace={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={saveWorkspace}
        />
      )}

      {deleting && (
        <Modal
          size="sm"
          onClose={() => setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          subtitle="Running commands are stopped first. The project files are untouched."
          footer={
            <>
              <Button size="sm" variant="subtle" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={handleDeleteWorkspace}>
                Delete
              </Button>
            </>
          }
        >
          <p className="text-xs text-muted">
            This removes the workspace definition from{' '}
            <code className="font-mono text-ink">~/.localhost-manager/workspaces.json</code>.
          </p>
        </Modal>
      )}

      {conflict && (
        <PortConflictModal
          conflicts={conflict.conflicts}
          workspaceName={conflict.workspace.name}
          onClose={() => setConflict(null)}
          onStopAndStart={handleResolveConflict}
          onStartAnyway={() => {
            const id = conflict.workspace.id;
            setConflict(null);
            handleStartWorkspace(id, true);
          }}
        />
      )}

      {showSummary && (
        <WhatsRunningModal services={allServices} onClose={() => setShowSummary(false)} />
      )}

      {showPalette && (
        <CommandPalette
          services={allServices}
          workspaces={workspaces}
          onClose={() => setShowPalette(false)}
          onRefresh={refresh}
          onOpenSettings={() => setShowSettings(true)}
          onOpenStopAll={() => setShowStopAll(true)}
          onSetCategoryFilter={(cat) => {
            setActiveTab('services');
            setCategoryFilter(cat);
          }}
          onStartWorkspace={(id) => handleStartWorkspace(id)}
          onStopService={(pid) => stopProcessTree(pid, false)}
        />
      )}

      {showStopAll && (
        <StopAllConfirmModal
          services={allServices}
          onClose={() => setShowStopAll(false)}
          onConfirm={handleStopAll}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onThemeChange={setTheme} />
      )}

      {showWelcome && <FirstRunModal onDismiss={dismissWelcome} />}
    </div>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <AppContent />
  </ToastProvider>
);

export default App;
