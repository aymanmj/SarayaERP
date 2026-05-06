// ============================================
// useNetworkStatus — Offline-First Network Monitor
// ============================================
// يراقب حالة الاتصال بالسيرفر المحلي وبالإنترنت
// يميّز بين: متصل بالكامل | سيرفر فقط (بدون إنترنت) | غير متصل

import { useState, useEffect, useCallback, useRef } from 'react';

export type NetworkStatus = 'online' | 'server-only' | 'offline';

interface NetworkState {
  /** الحالة الحالية للاتصال */
  status: NetworkStatus;
  /** هل السيرفر المحلي يستجيب؟ */
  serverReachable: boolean;
  /** هل الإنترنت الخارجي متاح؟ */
  internetAvailable: boolean;
  /** آخر وقت تم فيه فحص الاتصال */
  lastChecked: Date | null;
}

const CHECK_INTERVAL = 15_000; // فحص كل 15 ثانية
const SERVER_HEALTH_URL = '/api/health';
const CONNECTIVITY_URL = '/api/health/connectivity';
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
    let internetAvailable = navigator.onLine;

    // فحص السيرفر المحلي
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(SERVER_HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeout);
      serverReachable = response.ok;

      // إذا السيرفر يعمل، اسأله عن حالة الإنترنت (أدق من navigator.onLine)
      if (serverReachable) {
        try {
          const connectivityResponse = await fetch(CONNECTIVITY_URL, {
            method: 'GET',
            cache: 'no-store',
          });
          if (connectivityResponse.ok) {
            const data = await connectivityResponse.json();
            internetAvailable = data.isOnline === true;
          }
        } catch {
          // لا نستطيع فحص الـ connectivity — نعتمد على navigator.onLine
        }
      }
    } catch {
      serverReachable = false;
    }

    // تحديد الحالة
    let status: NetworkStatus;
    if (serverReachable && internetAvailable) {
      status = 'online';
    } else if (serverReachable && !internetAvailable) {
      status = 'server-only';
    } else {
      status = 'offline';
    }

    setState({
      status,
      serverReachable,
      internetAvailable,
      lastChecked: new Date(),
    });
  }, []);

  useEffect(() => {
    // فحص فوري عند التحميل
    checkStatus();

    // فحص دوري
    intervalRef.current = setInterval(checkStatus, CHECK_INTERVAL);

    // استمع لأحداث المتصفح
    const handleOnline = () => checkStatus();
    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        status: prev.serverReachable ? 'server-only' : 'offline',
        internetAvailable: false,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkStatus]);

  return state;
}

