import React from 'react';
import { cn } from '@/lib/utils';
import type { ProjectStatus } from '@/lib/agency/types/project';

export interface ProjectStatusBadgeProps {
  status: ProjectStatus | string;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
  title?: string;
}

const STATUS_CONFIGS: Record<string, StatusConfig> = {
  ACTIVE: {
    label: 'ACTIVE',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/25',
    dot: 'bg-emerald-400',
    title: 'Active project',
  },
  ON_HOLD: {
    label: 'PAUSED',
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/25',
    dot: 'bg-amber-400',
    title: 'Project paused (On Hold)',
  },
  PAUSED: {
    label: 'PAUSED',
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/25',
    dot: 'bg-amber-400',
    title: 'Project paused',
  },
  CANCELLED: {
    label: 'CANCELLED',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/25',
    dot: 'bg-rose-400',
    title: 'Cancelled project',
  },
  DRAFT: {
    label: 'DRAFT',
    bg: 'bg-neutral-500/10',
    text: 'text-neutral-400',
    border: 'border-neutral-500/20',
    dot: 'bg-neutral-400',
    title: 'Draft project',
  },
  COMPLETED: {
    label: 'COMPLETED',
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/25',
    dot: 'bg-sky-400',
    title: 'Completed project',
  },
  ARCHIVED: {
    label: 'ARCHIVED',
    bg: 'bg-neutral-800/40',
    text: 'text-neutral-500',
    border: 'border-neutral-700/30',
    dot: 'bg-neutral-600',
    title: 'Archived project',
  },
};

const DEFAULT_CONFIG: StatusConfig = {
  label: 'UNKNOWN',
  bg: 'bg-neutral-500/10',
  text: 'text-neutral-400',
  border: 'border-neutral-500/20',
  dot: 'bg-neutral-400',
};

export function ProjectStatusBadge({
  status,
  size = 'sm',
  showDot = true,
  className,
}: ProjectStatusBadgeProps) {
  const normalizedKey = String(status || '').toUpperCase();
  const config = STATUS_CONFIGS[normalizedKey] || {
    ...DEFAULT_CONFIG,
    label: normalizedKey || 'UNKNOWN',
  };

  return (
    <span
      data-status={normalizedKey}
      title={config.title || config.label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium tracking-wide select-none',
        config.bg,
        config.text,
        config.border,
        size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-[11.5px] px-2.5 py-0.5',
        className
      )}
    >
      {showDot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)}
          aria-hidden="true"
        />
      )}
      <span>{config.label}</span>
    </span>
  );
}
