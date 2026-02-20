// src/layout/Layout.tsx

import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      <header className="bg-white shadow flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg text-sky-700">
            منظومة المستشفى
          </span>
          <nav className="flex gap-3 text-sm">
            <Link
              to="/patients"
              className={
                "px-3 py-1 rounded " +
                (location.pathname.startsWith("/patients") ||
                location.pathname === "/"
                  ? "bg-sky-100 text-sky-800"
                  : "hover:bg-slate-100")
              }
            >
              المرضى
            </Link>

            <Link
              to="/appointments"
              className={
                "px-3 py-1 rounded " +
                (location.pathname.startsWith("/appointments")
                  ? "bg-sky-100 text-sky-800"
                  : "hover:bg-slate-100")
              }
            >
              المواعيد
            </Link>

            <Link
              to="/discharge-planning"
              className={
                "px-3 py-1 rounded " +
                (location.pathname.startsWith("/discharge-planning")
                  ? "bg-sky-100 text-sky-800"
                  : "hover:bg-slate-100")
              }
            >
              تخطيط الخروج
            </Link>

            <Link
              to="/bed-management"
              className={
                "px-3 py-1 rounded " +
                (location.pathname.startsWith("/bed-management")
                  ? "bg-sky-100 text-sky-800"
                  : "hover:bg-slate-100")
              }
            >
              إدارة الأسرة
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {user && (
            <div className="text-right">
              <div className="font-semibold">{user.fullName}</div>
              <div className="text-xs text-slate-500">
                {user.roles?.join(" | ")}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="text-xs px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
