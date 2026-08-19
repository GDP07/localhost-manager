import React from 'react';
import { HealthStatus } from '../../../shared/types/service';
import { cn } from '../utils/cn';
import { Badge } from './Badge';

/**
 * Single source of truth for how a health status looks and reads, so the card, the
 * table, the inspector and the filter can never disagree about what a state means.
 */
export const HEALTH: Record<
  HealthStatus,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral'; dot: string; note: string }
> = {
  healthy: {
    label: 'Responding',
    tone: 'ok',
    dot: 'bg-ok',
    note: 'Answered an HTTP request'
  },
  starting: {
    label: 'Starting',
    tone: 'warn',
    dot: 'bg-warn',
    note: 'Accepted the connection but has not answered yet'
  },
  unreachable: {
    label: 'Unreachable',
    tone: 'danger',
    dot: 'bg-danger',
    note: 'Port is held open but refused the connection'
  },
  unknown: {
    label: 'Unknown',
    tone: 'neutral',
    dot: 'bg-faint',
    note: 'Not an HTTP service, or the probe was inconclusive'
  }
};

export const StatusDot: React.FC<{ health: HealthStatus; className?: string }> = ({
  health,
  className
}) => (
  <span
    title={HEALTH[health].note}
    className={cn('h-2 w-2 shrink-0 rounded-full', HEALTH[health].dot, className)}
  />
);

export const HealthBadge: React.FC<{ health: HealthStatus }> = ({ health }) => (
  <Badge tone={HEALTH[health].tone}>{HEALTH[health].label}</Badge>
);
