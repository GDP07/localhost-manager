import React from 'react';
import { ShieldCheck, GitBranch } from 'lucide-react';
import { DevSupervisor, ProcessSupervisor } from '../../../shared/types/service';
import { Badge } from './Badge';

export const SUPERVISOR_NAME: Record<ProcessSupervisor['kind'], string> = {
  launchd: 'launchd',
  systemd: 'systemd',
  'windows-service': 'Windows Services'
};

/** Why stopping it does not stick — the sentence a user actually needs here. */
export function supervisorExplanation(supervisor: ProcessSupervisor): string {
  const manager = SUPERVISOR_NAME[supervisor.kind];
  return `Started and kept alive by ${manager} as "${supervisor.label}". Stopping it here ` +
    `restarts it, because ${manager} relaunches it immediately.`;
}

export const SupervisorBadge: React.FC<{ supervisor: ProcessSupervisor }> = ({ supervisor }) => (
  <Badge tone="accent" className="shrink-0">
    <ShieldCheck className="h-3 w-3 shrink-0" />
    <span title={supervisorExplanation(supervisor)}>
      {SUPERVISOR_NAME[supervisor.kind]}
    </span>
  </Badge>
);

/** The short label for a respawning parent, e.g. "php artisan serve". */
export function devSupervisorLabel(supervisor: DevSupervisor): string {
  const cmd = supervisor.commandLine.trim();
  // Splitting on whitespace alone mangles executables whose path contains a space
  // ("/Applications/Google Chrome.app/..."), so cut at the executable's own name first.
  const at = cmd.lastIndexOf(supervisor.name);
  const tokens = (at >= 0 ? cmd.slice(at) : cmd).split(/\s+/);
  const head = tokens[0]?.split(/[\\/]/).pop() || supervisor.name;
  // The first couple of positional arguments are what a developer recognises —
  // "php artisan serve", "npm run dev" — while flags are noise at this size.
  const args = tokens.slice(1, 3).filter((t) => !t.startsWith('-'));
  return [head, ...args].join(' ');
}

export function devSupervisorExplanation(supervisor: DevSupervisor): string {
  // Deliberately does not promise a respawn: `php artisan serve` and `nodemon` do start a
  // replacement, but `npm run dev` simply exits. What is true of both is that stopping
  // the child alone leaves the parent behind, which is never what Stop should mean.
  return `This port is held by a child of ${devSupervisorLabel(supervisor)} (PID ${supervisor.pid}). ` +
    `Stopping the child alone leaves that parent running — and if it is a watcher, it starts ` +
    `a replacement within seconds. Stop targets the parent, so the whole job goes.`;
}

export const DevSupervisorBadge: React.FC<{ supervisor: DevSupervisor }> = ({ supervisor }) => (
  <Badge tone="neutral" className="shrink-0">
    <GitBranch className="h-3 w-3 shrink-0" />
    <span title={devSupervisorExplanation(supervisor)}>supervised</span>
  </Badge>
);
