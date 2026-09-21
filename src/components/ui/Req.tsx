import React from 'react';
import { cn } from '@/lib/utils';

export interface ReqProps {
  satisfied?: boolean;
  className?: string;
  title?: string;
}

/**
 * Standard required field indicator.
 * Displays a red indicator (*) when empty/unsatisfied,
 * and turns emerald/green (*) when valid data is entered or selected.
 */
export function Req({ satisfied = false, className, title }: ReqProps) {
  return (
    <span
      className={cn(
        "font-semibold ml-0.5 inline-block transition-colors duration-200",
        satisfied ? "text-emerald-400" : "text-rose-400",
        className
      )}
      title={title || (satisfied ? "Field completed" : "Required field")}
      aria-label={satisfied ? "completed" : "required"}
    >
      *
    </span>
  );
}

export interface OptProps {
  className?: string;
}

/**
 * Standard optional field indicator badge.
 */
export function Opt({ className }: OptProps) {
  return (
    <span className={cn("text-neutral-500 text-[10px] font-normal normal-case tracking-normal ml-1", className)}>
      (optional)
    </span>
  );
}
