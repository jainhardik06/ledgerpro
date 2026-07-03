"use client";

import React, { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';

export function BroadcastBanner() {
  const [broadcast, setBroadcast] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/broadcasts/active')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.broadcast) {
          const dismissedId = localStorage.getItem('dismissed-broadcast-id');
          if (dismissedId !== data.broadcast.id) {
            setBroadcast(data.broadcast);
          }
        }
      })
      .catch(() => {});
  }, []);

  if (!broadcast || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem('dismissed-broadcast-id', broadcast.id);
    setDismissed(true);
  };

  const styles = broadcast.type?.includes('Emergency')
    ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
    : broadcast.type?.includes('Feature')
    ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
    : 'border-amber-500/20 bg-amber-500/10 text-amber-300';

  return (
    <div className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b text-[13px] ${styles}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Megaphone className="w-4 h-4 shrink-0" />
        <span className="font-medium shrink-0">{broadcast.type}:</span>
        <span className="truncate">{broadcast.message}</span>
      </div>
      <button onClick={dismiss} aria-label="Dismiss notice" className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
