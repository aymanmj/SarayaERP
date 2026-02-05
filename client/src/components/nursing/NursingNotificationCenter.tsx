// src/components/nursing/NursingNotificationCenter.tsx
import { useState, useEffect } from 'react';
import { useNursingWebSocket } from '../../hooks/useNursingWebSocket';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  BellIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ClockIcon,
  HeartIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';

interface NotificationCenterProps {
  className?: string;
}

export function NursingNotificationCenter({ className = '' }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const {
    isConnected,
    alerts,
    medicationUpdates,
    vitalsUpdates,
    clearAlerts,
    clearMedicationUpdates,
    clearVitalsUpdates,
  } = useNursingWebSocket();

  const allNotifications = [
    ...alerts.map(alert => ({
      id: `alert-${alert.encounterId}-${alert.timestamp}`,
      type: 'alert' as const,
      priority: alert.type,
      title: `تنبيه مريض: ${alert.patientName}`,
      message: alert.message,
      timestamp: alert.timestamp,
      encounterId: alert.encounterId,
    })),
    ...medicationUpdates.map(update => ({
      id: `med-${update.encounterId}-${update.timestamp}`,
      type: 'medication' as const,
      priority: update.status === 'OVERDUE' ? 'CRITICAL' : update.status === 'ADMINISTERED' ? 'INFO' : 'WARNING',
      title: `تحديث دواء: ${update.medication}`,
      message: update.administeredBy 
        ? `تم الإعطاء بواسطة: ${update.administeredBy}`
        : `الحالة: ${update.status}`,
      timestamp: update.timestamp,
      encounterId: update.encounterId,
    })),
    ...vitalsUpdates.map(update => ({
      id: `vitals-${update.encounterId}-${update.timestamp}`,
      type: 'vitals' as const,
      priority: 'WARNING' as const,
      title: `تحديث العلامات الحيوية`,
      message: `تم تحديث العلامات الحيوية بواسطة: ${update.nurseName}`,
      timestamp: update.timestamp,
      encounterId: update.encounterId,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredNotifications = showCriticalOnly 
    ? allNotifications.filter(n => n.priority === 'CRITICAL')
    : allNotifications;

  const criticalCount = allNotifications.filter(n => n.priority === 'CRITICAL').length;

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />;
      case 'WARNING':
        return <ShieldExclamationIcon className="w-5 h-5 text-amber-500" />;
      case 'INFO':
      default:
        return <InformationCircleIcon className="w-5 h-5 text-blue-500" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return <BellIcon className="w-4 h-4" />;
      case 'medication':
        return <ClockIcon className="w-4 h-4" />;
      case 'vitals':
        return <HeartIcon className="w-4 h-4" />;
      default:
        return <InformationCircleIcon className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'border-red-500 bg-red-500/10';
      case 'WARNING':
        return 'border-amber-500 bg-amber-500/10';
      case 'INFO':
      default:
        return 'border-blue-500 bg-blue-500/10';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'HH:mm', { locale: ar });
    } catch {
      return timestamp;
    }
  };

  if (!isConnected) {
    return (
      <div className={`bg-slate-900 border border-slate-800 rounded-xl p-4 text-center ${className}`}>
        <div className="text-slate-500 text-sm">
          <BellIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
          غير متصل بمركز الإشعارات
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
      >
        <BellIcon className="w-6 h-6 text-slate-300" />
        {criticalCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {criticalCount > 99 ? '99+' : criticalCount}
          </span>
        )}
        <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full"></span>
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="absolute top-12 left-0 w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2">
                <BellIcon className="w-5 h-5" />
                مركز الإشعارات
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center gap-4 mt-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={showCriticalOnly}
                  onChange={(e) => setShowCriticalOnly(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-600"
                />
                الطوارئ فقط
              </label>
              <span className="text-xs text-slate-500">
                {filteredNotifications.length} إشعار
              </span>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-64">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <CheckCircleIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <div>لا توجد إشعارات</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border-r-4 ${getPriorityColor(notification.priority)} hover:bg-slate-800/50 transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getPriorityIcon(notification.priority)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getTypeIcon(notification.type)}
                          <h4 className="text-white font-medium text-sm truncate">
                            {notification.title}
                          </h4>
                        </div>
                        <p className="text-slate-400 text-xs mb-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">
                            {formatTimestamp(notification.timestamp)}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${getPriorityColor(notification.priority)}`}>
                            {notification.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-700 bg-slate-800/50">
            <div className="flex gap-2">
              <button
                onClick={clearAlerts}
                className="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
              >
                مسح التنبيهات
              </button>
              <button
                onClick={clearMedicationUpdates}
                className="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
              >
                مسح الأدوية
              </button>
              <button
                onClick={clearVitalsUpdates}
                className="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors"
              >
                مسح العلامات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
