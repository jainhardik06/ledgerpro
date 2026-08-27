"use client";

import { useState, useEffect } from 'react';
import { getOfflineRequests, removeOfflineRequest, OfflineRequest } from '@/lib/indexeddb';

export function useOfflineQueue() {
  const [queue, setQueue] = useState<OfflineRequest[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const refreshQueue = async () => {
    const requests = await getOfflineRequests();
    setQueue(requests);
  };

  const syncQueue = async () => {
    const requests = await getOfflineRequests();
    if (requests.length === 0) return;

    setIsSyncing(true);
    let successCount = 0;

    for (const req of requests) {
      try {
        const response = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
        });

        // 2xx status codes or 4xx client errors (don't retry a bad request infinitely)
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          await removeOfflineRequest(req.id);
          successCount++;
        }
      } catch (error) {
        console.error('Failed to sync offline request:', req.id, error);
        // Leave in queue
      }
    }

    setIsSyncing(false);
    await refreshQueue();
    return successCount;
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
    
    refreshQueue();

    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Listen for manual queue updates
    window.addEventListener('offline-queue-updated', refreshQueue);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', refreshQueue);
    };
  }, []);

  return { queue, isSyncing, isOnline, syncQueue, refreshQueue };
}
