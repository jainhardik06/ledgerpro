import { addOfflineRequest } from './indexeddb';

export async function fetchWithQueue(url: string, options: RequestInit = {}) {
  try {
    const response = await fetch(url, options);
    
    // If response is not ok but we reached the server, we just return it
    if (!response.ok) {
      return response;
    }
    
    return response;
  } catch (error) {
    // If it's a GET request, we let the Service Worker or standard cache handle it
    if (!options.method || options.method.toUpperCase() === 'GET') {
      throw error;
    }

    // For POST/PUT/DELETE, save to offline queue
    console.warn('Network request failed. Saving to offline queue:', url);
    
    // Convert headers to a standard record
    const headersRecord: Record<string, string> = {};
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headersRecord[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headersRecord[key] = value;
        });
      } else {
        Object.assign(headersRecord, options.headers);
      }
    }

    let bodyString = null;
    if (options.body) {
      if (typeof options.body === 'string') {
        bodyString = options.body;
      } else {
        try {
          bodyString = JSON.stringify(options.body);
        } catch(e) {
          console.error("Could not stringify body for offline queue");
        }
      }
    }

    await addOfflineRequest({
      url,
      method: options.method.toUpperCase(),
      headers: headersRecord,
      body: bodyString,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('offline-queue-updated'));
    }

    // Provide a mocked successful response so the UI thinks it succeeded
    return new Response(JSON.stringify({ queuedOffline: true, message: "Saved offline. Will sync when reconnected." }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
