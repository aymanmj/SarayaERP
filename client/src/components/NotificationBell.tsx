// src/components/NotificationBell.tsx

import { useEffect, useState, useRef } from "react";
import { apiClient } from "../api/apiClient";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

type Notification = {
  id: number;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
};

// أيقونة الجرس (SVG)
function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // جلب الإشعارات
  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await apiClient.get<Notification[]>("/notifications");
      setNotifications(res.data);
      setUnreadCount(res.data.filter((n) => !n.isRead).length);
    } catch (err) {
      console.error("Failed to fetch notifications");
    }
  };

  // Poll كل 60 ثانية
  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRead = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await apiClient.patch(`/notifications/${n.id}/read`);
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === n.id ? { ...item, isRead: true } : item,
          ),
        );
      } catch (e) {
        console.error(e);
      }
    }

    if (n.link) {
      setIsOpen(false);
      navigate(n.link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
      >
        <BellIcon className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-1 ring-slate-900">
            {unreadCount > 9 ? "+9" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 max-h-[400px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl z-50 origin-top-left animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-950/50">
            <h3 className="text-sm font-semibold text-white">الإشعارات</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                تحديد الكل كمقروء
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[300px] scrollbar-thin scrollbar-thumb-slate-700">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                لا توجد إشعارات جديدة
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleRead(n)}
                    className={`cursor-pointer px-4 py-3 transition-colors hover:bg-slate-800/50 ${
                      !n.isRead ? "bg-slate-800/20" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p
                        className={`text-sm font-medium ${!n.isRead ? "text-sky-300" : "text-slate-300"}`}
                      >
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="h-2 w-2 rounded-full bg-sky-500 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-600 text-right font-mono">
                      {new Date(n.createdAt).toLocaleTimeString("ar-LY", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-950/30 px-4 py-2 text-center">
            <span className="text-[10px] text-slate-600">
              يتم تحديث الإشعارات تلقائياً
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
