"use client";

import React from "react";

interface BetaBadgeProps {
  className?: string;
}

export function BetaBadge({ className = "" }: BetaBadgeProps) {
  return (
    <span
      className={`inline-flex items-center select-none rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-neutral-400 leading-none ${className}`}
    >
      Beta
    </span>
  );
}
