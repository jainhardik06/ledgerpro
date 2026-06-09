'use client';

import { useEffect } from 'react';
import { captureUTMs } from '@/lib/utm';

export default function ClientInitialization() {
  useEffect(() => {
    captureUTMs();
  }, []);

  return null;
}
