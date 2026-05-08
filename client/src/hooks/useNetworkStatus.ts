import { useState, useEffect, useCallback, useRef } from 'react';

export type NetworkStatus = 'online' | 'server-only' | 'offline';

interface NetworkState {
  status: NetworkStatus;
  serverReachable: boolean;
  internetAvailable: boolean;
  lastChecked: Date | null;
}

// Basic health (is the server alive?)
const HEALTH_URL = '/api/health';
// Server-side connectivity (does the server have internet?)
const CONNECTIVITY_URL = '/api/health/connectivity';

const CHECK_INTERVAL = 30_000; // 30s — matches backend ConnectivityService interval
const TIMEOUT_MS = 5_000;

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    status: 'online',
    serverReachable: true,
    internetAvailable: true,
    lastChecked: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    let serverReachable = false;
    let internetAvailable = true;

    // Step 1: Can we reach the server at all?
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeout);
      serverReachable = response.ok;
    } catch {
      serverReachable = false;
    }

    // Step 2: If server is reachable, ask it about its own internet status
    if (serverReachable) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(CONNECTIVITY_URL, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
        });

        clearTimeout(timeout);

        if (response.ok) {
          const responseBody = await response.json();
          // Backend uses TransformInterceptor, so the actual payload is inside `data`
          const payload = responseBody.data ? responseBody.data : responseBody;
          internetAvailable = payload.isOnline === true;
        }
      } catch {
        // If connectivity endpoint fails, assume internet is available
        // (don't penalize for endpoint errors)
        internetAvailable = true;
      }
    }

    // Step 3: Determine status
    let status: NetworkStatus;
    if (!serverReachable) {
      status = 'offline';          // 🔴 Server unreachable
    } else if (!internetAvailable) {
      status = 'server-only';      // 🟡 Server up, no internet
    } else {
      status = 'online';           // 🟢 Fully connected
    }

    setState({
      status,
      serverReachable,
      internetAvailable,
      lastChecked: new Date(),
    });
  }, []);

  useEffect(() => {
    // Initial check with a small delay to avoid flash on page load
    const initTimer = setTimeout(checkStatus, 1_500);

    intervalRef.current = setInterval(checkStatus, CHECK_INTERVAL);

    const handleOnline = () => checkStatus();
    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        status: 'offline',
        serverReachable: false,
        internetAvailable: false,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(initTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkStatus]);

  return state;
}
