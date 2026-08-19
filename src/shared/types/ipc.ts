import { PortConflict } from './service';

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StopProcessOptions {
  pid: number;
  force?: boolean;
  tree?: boolean;
}

export interface StartWorkspaceResult {
  success: boolean;
  error?: string;
  conflicts?: PortConflict[];
}

export interface StopAllDevResult {
  stoppedCount: number;
  failedCount: number;
  stoppedPids: number[];
}

export interface FirstRunSummary {
  portsCount: number;
  projectsCount: number;
  devEnvironmentsCount: number;
}
