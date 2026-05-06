// ============================================
// NetworkStatusBanner — Offline-First Status Indicator
// ============================================
// شريط أنيق يظهر أعلى الشاشة فقط عند الحاجة:
// 🟢 متصل بالكامل → لا يظهر شيء
// 🟡 سيرفر فقط (بدون إنترنت) → شريط أصفر هادئ
// 🔴 غير متصل بالسيرفر → شريط أحمر

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Cloud, CloudOff } from 'lucide-react';
import { useNetworkStatus, type NetworkStatus } from '@/hooks/useNetworkStatus';

const STATUS_CONFIG: Record<NetworkStatus, {
  show: boolean;
  icon: React.ElementType;
  message: string;
  messageEn: string;
  bgClass: string;
  textClass: string;
  iconClass: string;
}> = {
  online: {
    show: false,
    icon: Wifi,
    message: '',
    messageEn: '',
    bgClass: '',
    textClass: '',
    iconClass: '',
  },
  'server-only': {
    show: true,
    icon: CloudOff,
    message: 'يعمل بدون إنترنت — الخدمات الخارجية معلّقة حتى عودة الاتصال',
    messageEn: 'Working offline — External services queued',
    bgClass: 'bg-amber-500/90 backdrop-blur-sm',
    textClass: 'text-amber-950',
    iconClass: 'text-amber-900',
  },
  offline: {
    show: true,
    icon: WifiOff,
    message: 'لا يمكن الاتصال بالسيرفر — تحقق من اتصال الشبكة المحلية',
    messageEn: 'Cannot reach server — Check local network',
    bgClass: 'bg-red-500/90 backdrop-blur-sm',
    textClass: 'text-white',
    iconClass: 'text-red-100',
  },
};

export function NetworkStatusBanner() {
  const { status } = useNetworkStatus();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const config = STATUS_CONFIG[status];

  useEffect(() => {
    if (config.show && !dismissed) {
      // تأخير بسيط لمنع وميض عند بدء التشغيل
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [config.show, dismissed]);

  // إعادة عرض الشريط عند تغير الحالة
  useEffect(() => {
    setDismissed(false);
  }, [status]);

  if (!config.show || !visible) {
    return null;
  }

  const Icon = config.icon;

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-[9999]
        ${config.bgClass}
        transition-all duration-500 ease-in-out
        transform ${visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}
        shadow-lg
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={`w-4 h-4 ${config.iconClass} flex-shrink-0`} />
          <span className={`text-sm font-medium ${config.textClass}`} dir="rtl">
            {config.message}
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className={`
            ${config.textClass} hover:opacity-70 transition-opacity
            text-lg font-bold px-2 py-0.5 rounded
            focus:outline-none focus:ring-2 focus:ring-white/30
          `}
          aria-label="إغلاق"
          title="إغلاق"
        >
          ×
        </button>
      </div>
    </div>
  );
}
