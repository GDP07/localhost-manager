import { RawProcessInfo } from './PlatformAdapter';
import { DevSupervisor } from '../../shared/types/service';

/**
 * Resolving which process to actually stop.
 *
 * The process holding a port is very often not the process that owns it. `php artisan
 * serve` spawns `php -S` as a child and restarts it whenever it exits; `npm run dev`
 * spawns the real dev server through a shell; `nodemon` exists precisely to respawn.
 * Killing the port holder in those cases is a no-op with extra steps — the supervisor
 * notices the exit and starts a replacement, usually within a second or two.
 *
 * So a stop has to walk *up* the parent chain to the top of the job, not just down the
 * child chain from the port holder. The hard part is knowing where to stop walking:
 * one step too far and we kill the user's shell, their terminal, or their editor.
 */

/** A parent chain longer than this is a sign the fences below failed; bail out. */
const MAX_WALK_DEPTH = 12;

/**
 * Never crossed, whatever else is true of them. These are session infrastructure: the
 * thing that *hosts* dev servers rather than the thing that supervises one.
 */
const BOUNDARY_NAMES = new Set([
  // Process 1 and the service managers
  'launchd', 'init', 'systemd', 'runit', 'openrc', 'services', 'svchost', 'wininit',
  // Remote and multiplexed sessions
  'sshd', 'login', 'tmux', 'tmux: server', 'screen', 'mosh-server',
  // Terminal emulators
  'terminal', 'iterm2', 'iterm', 'warp', 'warpterminal', 'alacritty', 'kitty', 'wezterm',
  'wezterm-gui', 'hyper', 'konsole', 'gnome-terminal-server', 'xterm', 'urxvt', 'st',
  'windowsterminal', 'conhost', 'openconsole',
  // Editors and IDEs that host integrated terminals
  'code', 'code helper', 'code helper (plugin)', 'code helper (renderer)', 'codium',
  'cursor', 'cursor helper', 'windsurf', 'zed', 'sublime_text', 'atom', 'idea', 'pycharm',
  'webstorm', 'goland', 'phpstorm', 'rubymine', 'clion', 'rider', 'fleet', 'devenv',
  'explorer', 'finder', 'dock',
  // Container and VM runtimes: their children are not ours to reparent
  'docker', 'dockerd', 'com.docker.backend', 'containerd', 'containerd-shim', 'podman',
  'colima', 'qemu-system-x86_64', 'vmware-vmx', 'orbstack',
  // Browsers and desktop apps, which spawn helper processes into their own process
  // group. Named here for the platforms where the bundle check below cannot see them.
  'google chrome', 'chrome', 'chromium', 'firefox', 'msedge', 'brave browser', 'brave',
  'safari', 'opera', 'vivaldi', 'arc', 'slack', 'discord', 'spotify', 'zoom.us', 'zoom',
  'teams', 'obsidian', 'notion', 'figma', 'postman', 'insomnia', 'steam'
]);

/** Shells, which are a boundary when interactive but a supervisor when running a script. */
const SHELL_NAMES = new Set([
  'sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'ash',
  'cmd', 'powershell', 'pwsh'
]);

/**
 * Commands that supervise a child server. Used as positive evidence on Windows, which
 * has no process groups to fence the walk with.
 */
const SUPERVISOR_PATTERNS: RegExp[] = [
  /\bartisan\s+serve\b/,
  /\bnodemon\b/,
  /\bpm2\b/,
  /\bconcurrently\b/,
  /\bnpm-run-all\b/,
  /\bnpm\s+(run|start|exec)\b/,
  /\b(yarn|pnpm|bun)\s+(run|dev|start)\b/,
  /\b(turbo|nx)\s+run\b/,
  /\b(foreman|overmind|honcho|hivemind)\b/,
  /\bcargo\s+watch\b/,
  /\bdotnet\s+watch\b/,
  /\bwatchmedo\b/,
  /\bair\b(?:\s|$)/,
  /\bgunicorn\b/,
  /\buvicorn\b/,
  /\bflask\s+run\b/,
  /\bmanage\.py\s+runserver\b/,
  /\brails\s+(server|s)\b/,
  /\bpuma\b/,
  /\bwebpack(-dev-server)?\b/,
  /\bvite\b/,
  /\bnext\s+dev\b/,
  /\bspring-boot:run\b/
];

export interface SupervisionRoot {
  /** The pid a stop should target. Equals the starting pid when it supervises itself. */
  pid: number;
  /** Ancestors crossed to get there, nearest parent first. Empty when nothing was crossed. */
  chain: RawProcessInfo[];
}

/** argv after argv[0]. Approximate for paths with spaces, and only used for flag checks. */
function argvTail(commandLine: string): string[] {
  return commandLine.trim().split(/\s+/).slice(1);
}

function normalisedName(proc: RawProcessInfo): string {
  return proc.name.toLowerCase().replace(/^-/, '').replace(/\.exe$/, '');
}

/**
 * A shell running a script (`sh ./start.sh`, `sh -c vite`) is a supervisor and can be
 * crossed. An interactive or login shell is the user's session and must not be.
 */
function isInteractiveShell(proc: RawProcessInfo): boolean {
  if (!SHELL_NAMES.has(normalisedName(proc))) return false;

  const args = argvTail(proc.commandLine);
  if (args.length === 0) return true; // bare `zsh`
  // A leading dash on argv[0] is the convention for a login shell ("-zsh").
  if (proc.commandLine.trimStart().startsWith('-')) return true;
  return args.some((a) => a === '-i' || a === '-l' || a === '--login' || a === '--interactive');
}

/**
 * A macOS application bundle.
 *
 * This check is what keeps the process-group fence honest. A browser spawns its helper
 * processes into its own process group, so sharing a pgid with one of them is
 * structurally the same signal a real dev job gives — and acting on it would mean
 * answering "stop the process on port 5353" by killing the user's browser. Desktop
 * applications ship as bundles; npm, node, php and python do not.
 */
function isApplicationBundle(proc: RawProcessInfo): boolean {
  return /\.app\/Contents\//.test(proc.executablePath);
}

function isBoundary(proc: RawProcessInfo): boolean {
  return (
    BOUNDARY_NAMES.has(normalisedName(proc)) ||
    isApplicationBundle(proc) ||
    isInteractiveShell(proc)
  );
}

function looksLikeSupervisor(proc: RawProcessInfo): boolean {
  return SUPERVISOR_PATTERNS.some((re) => re.test(proc.commandLine));
}

/**
 * Whether `parent` belongs to the same job as the port holder.
 *
 * On POSIX this is answered structurally: a shell puts each job it starts into its own
 * process group, so sharing a pgid with the port holder *is* membership in that job, and
 * the shell itself sits outside it. On Windows there are no process groups, so we fall
 * back to requiring the parent to look like a supervisor by name.
 */
function supervises(parent: RawProcessInfo, start: RawProcessInfo): boolean {
  if (parent.pgid != null && start.pgid != null) {
    return parent.pgid === start.pgid;
  }
  return looksLikeSupervisor(parent);
}

/** Every ancestor of `pid`, used to keep a stop from ever climbing into our own process. */
export function ancestryOf(pid: number, processes: Map<number, RawProcessInfo>): Set<number> {
  const seen = new Set<number>([pid]);
  let current = processes.get(pid);

  while (current?.ppid && current.ppid > 1 && !seen.has(current.ppid)) {
    seen.add(current.ppid);
    current = processes.get(current.ppid);
  }

  return seen;
}

/**
 * The top of the job that owns `startPid` — the process whose death actually frees the
 * port, rather than triggering a respawn.
 */
export function resolveSupervisionRoot(
  startPid: number,
  processes: Map<number, RawProcessInfo>,
  options: { protectedPids?: ReadonlySet<number> } = {}
): SupervisionRoot {
  const start = processes.get(startPid);
  if (!start) return { pid: startPid, chain: [] };

  const protectedPids = options.protectedPids ?? new Set<number>();
  const chain: RawProcessInfo[] = [];
  const visited = new Set<number>([startPid]);
  let current = start;

  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    const ppid = current.ppid;
    // ppid 1 means the real parent is already gone: there is nothing left to respawn it.
    if (!ppid || ppid <= 1 || visited.has(ppid)) break;

    const parent = processes.get(ppid);
    if (!parent) break;
    if (protectedPids.has(ppid)) break;
    if (isBoundary(parent)) break;
    if (!supervises(parent, start)) break;

    visited.add(ppid);
    chain.push(parent);
    current = parent;
  }

  return { pid: current.pid, chain };
}

/** The supervisor to name in the UI, or null when the port holder is the top of its job. */
export function findDevSupervisor(
  startPid: number,
  processes: Map<number, RawProcessInfo>,
  options: { protectedPids?: ReadonlySet<number> } = {}
): DevSupervisor | null {
  const root = resolveSupervisionRoot(startPid, processes, options);
  if (root.pid === startPid) return null;

  const proc = processes.get(root.pid);
  if (!proc) return null;

  return { pid: proc.pid, name: proc.name, commandLine: proc.commandLine };
}

/**
 * Every pid that must die for the job to stay dead: the root, everything beneath it, and
 * — when the root leads its process group — the rest of that group, which catches
 * children that double-forked out of the parent chain.
 */
export function collectJobPids(rootPid: number, processes: Map<number, RawProcessInfo>): number[] {
  const childrenByPpid = new Map<number, RawProcessInfo[]>();
  for (const proc of processes.values()) {
    if (!proc.ppid) continue;
    const siblings = childrenByPpid.get(proc.ppid) ?? [];
    siblings.push(proc);
    childrenByPpid.set(proc.ppid, siblings);
  }

  // Breadth-first from the root, so the root stays first: it has to be signalled before
  // its children, or it respawns one in the gap.
  const ordered: number[] = [];
  const seen = new Set<number>();
  const queue = [rootPid];

  while (queue.length > 0) {
    const pid = queue.shift() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    ordered.push(pid);
    for (const child of childrenByPpid.get(pid) ?? []) queue.push(child.pid);
  }

  const root = processes.get(rootPid);
  if (root?.pgid != null && root.pgid === root.pid) {
    for (const proc of processes.values()) {
      if (proc.pgid === root.pgid && !seen.has(proc.pid)) {
        seen.add(proc.pid);
        ordered.push(proc.pid);
      }
    }
  }

  return ordered;
}
